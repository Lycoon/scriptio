/**
 * Import service for creating projects from imported files.
 * Creates remote projects for logged-in users, local projects for offline/desktop.
 */

import { BoardData, LayoutData, ProjectData, ProjectMetadata, ProjectState } from "@src/lib/project/project-state";
import { getAdapterByFilename } from "@src/lib/adapters/registry";
import { createCachedProject, createCachedProjectWithId } from "@src/lib/persistence/storage-provider/local-persistence";
import { writeYjsDocumentLocally } from "@src/lib/persistence/y-local-provider";
import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";
import { ScreenplaySchema } from "@src/lib/screenplay/editor";
import { TitlePageSchema } from "@src/lib/titlepage/editor";
import { Editor } from "@tiptap/react";
import { createProject } from "@src/lib/utils/requests";
import { CreateProjectBody } from "@src/lib/utils/api-bodies";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { CookieUser } from "@src/lib/utils/types";
import { isTauri } from "@tauri-apps/api/core";
import { ProjectRepository } from "../project/project-repository";

export interface ImportResult {
    success: boolean;
    projectId?: string;
    error?: string;
}

/**
 * Parse a file and extract project content.
 */
async function parseFile(file: File): Promise<ProjectData> {
    const adapter = getAdapterByFilename(file.name);
    if (!adapter) {
        throw new Error(`Unsupported file type: ${file.name.split(".").pop()}`);
    }

    const content = await file.arrayBuffer();
    const projectData = adapter.convertFrom(content) as ProjectData;

    if (!projectData.screenplay || projectData.screenplay.length === 0) {
        throw new Error("File appears to be empty or could not be parsed");
    }

    return projectData;
}

/**
 * Import a file into an existing project.
 */
export async function importFileIntoProject(
    file: File,
    editor?: Editor | null,
    titlePageEditor?: Editor | null,
    repository?: ProjectRepository | null,
): Promise<void> {
    const adapter = getAdapterByFilename(file.name);
    if (!adapter) {
        throw new Error(`Unsupported file type: ${file.name.split(".").pop()}`);
    }

    const content = await file.arrayBuffer();
    adapter.import(content, editor, titlePageEditor, repository);
    if (editor) editor.commands.focus();
}

/**
 * Create a Yjs document with project content and save to local persistence.
 */
async function createLocalYjsDocument(projectId: string, projectData: ProjectData): Promise<void> {
    const ydoc = new ProjectState();

    ydoc.transact(() => {
        // Screenplay fragment
        const screenplayFragment = ydoc.screenplayFragment();
        prosemirrorJSONToYXmlFragment(
            ScreenplaySchema,
            { type: "doc", content: projectData.screenplay },
            screenplayFragment,
        );

        // Titlepage fragment
        if (projectData.titlepage) {
            const titlepageFragment = ydoc.titlepageFragment();
            prosemirrorJSONToYXmlFragment(
                TitlePageSchema,
                { type: "doc", content: projectData.titlepage },
                titlepageFragment,
            );
        }

        // Maps
        if (projectData.metadata) {
            const metadataMap = ydoc.metadata();
            Object.entries(projectData.metadata).forEach(([key, value]) => metadataMap.set(key as keyof ProjectMetadata, value));
        }

        if (projectData.characters) {
            const charactersMap = ydoc.characters();
            Object.entries(projectData.characters).forEach(([key, value]) => charactersMap.set(key, value));
        }

        if (projectData.locations) {
            const locationsMap = ydoc.locations();
            Object.entries(projectData.locations).forEach(([key, value]) => locationsMap.set(key, value));
        }

        if (projectData.scenes) {
            const scenesMap = ydoc.scenes();
            Object.entries(projectData.scenes).forEach(([key, value]) => scenesMap.set(key, value));
        }

        if (projectData.board) {
            const boardMap = ydoc.board();
            Object.entries(projectData.board).forEach(([key, value]) => boardMap.set(key as keyof BoardData, value));
        }

        if (projectData.layout) {
            const layoutMap = ydoc.layout();
            Object.entries(projectData.layout).forEach(([key, value]) => layoutMap.set(key as keyof LayoutData, value));
        }

        if (projectData.comments) {
            const commentsMap = ydoc.comments();
            Object.entries(projectData.comments).forEach(([key, value]) => commentsMap.set(key, value));
        }
    });

    await writeYjsDocumentLocally(projectId, ydoc);
    ydoc.destroy();
}

/**
 * Create a remote project via API.
 */
async function createRemoteProject(userId: string, title: string, description?: string): Promise<string> {
    const body: CreateProjectBody = {
        title,
        description,
    };

    const res = await createProject(userId, body);
    const json = (await res.json()) as ApiResponse;

    if (!res.ok) {
        throw new Error(json.message || "Failed to create project");
    }

    return json.data.id;
}

/**
 * Import a file and create a new project with its content.
 * Creates a remote project if user is logged in, otherwise creates a local-only project.
 *
 * @param file - The file to import
 * @param user - The logged-in user (null if not logged in)
 * @param title - Optional title for the project (defaults to filename without extension)
 * @returns Import result with project ID on success
 */
export async function importFileAsProject(
    file: File,
    user: CookieUser | null | undefined,
    title?: string,
    isPro?: boolean,
): Promise<ImportResult> {
    try {
        // Parse the file content
        const projectData = await parseFile(file);

        // Create project title from filename if not provided
        const projectTitle = title || file.name.replace(/\.[^/.]+$/, "");

        let projectId: string | null = null;

        if (isTauri()) {
            // Desktop: offline-first - try cloud to get ID if Pro, always create locally
            if (user && user.id && isPro) {
                try {
                    projectId = await createRemoteProject(user.id, projectTitle);
                } catch {
                    // Server unreachable - will generate a local ID below
                }
            }
            if (projectId) {
                await createCachedProjectWithId(projectId, projectTitle, undefined, true);
            } else {
                const cachedProject = await createCachedProject(projectTitle);
                projectId = cachedProject.id;
            }
        } else if (user && user.id && isPro) {
            // Web: create remote project (Pro users only)
            projectId = await createRemoteProject(user.id, projectTitle);
        } else {
            // Web without auth or not Pro: create local-only project (IndexedDB)
            const cachedProject = await createCachedProject(projectTitle);
            projectId = cachedProject.id;
        }

        // Create Yjs document with the project content
        await createLocalYjsDocument(projectId, projectData);

        return {
            success: true,
            projectId,
        };
    } catch (error) {
        console.error("[ImportProject] Failed to import file:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Import failed",
        };
    }
}

/**
 * Get supported import file extensions.
 */
export function getSupportedImportExtensions(): string {
    return ".fountain,.txt,.fdx,.scriptio";
}
