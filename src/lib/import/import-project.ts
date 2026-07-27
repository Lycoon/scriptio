/**
 * Import service for creating projects from imported files.
 * Creates remote projects for logged-in users, local projects for offline/desktop.
 */

import { ProjectData, ProjectState, applyProjectData } from "@src/lib/project/project-state";
import { CURRENT_PROJECT_VERSION } from "@src/lib/project/migrations/project-migrations";
import { getImportAdapterByFilename } from "@src/lib/adapters/registry";
import { restoreScriptioAssets } from "@src/lib/adapters/scriptio/scriptio-adapter";
import { createCachedProject, createCachedProjectWithId } from "@src/lib/persistence/storage-provider/local-persistence";
import { writeYjsDocumentLocally } from "@src/lib/persistence/y-local-provider";
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
function parseProjectData(filename: string, content: ArrayBuffer): ProjectData {
    const adapter = getImportAdapterByFilename(filename);
    if (!adapter) {
        throw new Error(`Unsupported file type: ${filename.split(".").pop()}`);
    }

    const projectData = adapter.convertFrom(content) as ProjectData;

    if (!projectData.screenplay || projectData.screenplay.length === 0) {
        throw new Error("File appears to be empty or could not be parsed");
    }

    return projectData;
}

/**
 * Import a file into an existing project.
 *
 * `projectId` identifies the target project so bundled board image assets land
 * under the right key in local storage; it's the currently-open project, not
 * the (possibly different) id stamped inside the imported file.
 */
export async function importFileIntoProject(
    file: File,
    projectId: string,
    editor?: Editor | null,
    titlePageEditor?: Editor | null,
    repository?: ProjectRepository | null,
): Promise<void> {
    const adapter = getImportAdapterByFilename(file.name);
    if (!adapter) {
        throw new Error(`Unsupported file type: ${file.name.split(".").pop()}`);
    }

    // Bail before reading the file when the doc is in read-only mode (viewer
    // role). The Y.Doc rollback gate would revert every write the adapter
    // emits — this just avoids a brief flash of imported content in the UI.
    if (repository?.getState().isReadOnly) return;

    const content = await file.arrayBuffer();
    adapter.import(content, editor, titlePageEditor, repository);
    // Restore any bundled board image assets (no-op for non-Scriptio files).
    await restoreScriptioAssets(projectId, content);
    if (editor) editor.commands.focus();
}

/**
 * Create a Yjs document with project content and save to local persistence.
 */
async function createLocalYjsDocument(projectId: string, projectData: ProjectData): Promise<void> {
    const ydoc = new ProjectState();

    // Write every map and fragment the adapter produced. Adapters that only
    // parse a screenplay (fountain/fdx) supply a partial `ProjectData`;
    // `applyProjectData` ignores the keys they leave out.
    applyProjectData(ydoc, projectData);

    // Stamp the schema version: preserves the imported file's version if it had
    // one (so future-version files surface a migration error on open), otherwise
    // marks the doc as current so it skips migration on first load.
    const metadataMap = ydoc.metadata();
    if (metadataMap.get("version") === undefined) {
        ydoc.transact(() => metadataMap.set("version", CURRENT_PROJECT_VERSION));
    }

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

    const res = await createProject(body);
    const json = (await res.json()) as ApiResponse<{ id: string }>;

    if (!res.ok || !json.data) {
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
        // Parse the file content (kept as a buffer so bundled assets can be
        // restored after the new project id is known).
        const content = await file.arrayBuffer();
        const projectData = parseProjectData(file.name, content);

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

        // Restore any bundled board image assets under the new project id
        // (no-op for non-Scriptio files).
        await restoreScriptioAssets(projectId, content);

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
