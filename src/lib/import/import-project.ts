/**
 * Import service for creating projects from imported files.
 * Creates remote projects for logged-in users, local projects for offline/desktop.
 */

import { ProjectState } from "@src/lib/project/project-state";
import { getAdapterByFilename } from "@src/lib/adapters/registry";
import { createLocalProject } from "@src/lib/persistence/local-projects";
import { SqlitePersistence } from "@src/lib/persistence/sqlite-persistence";
import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";
import { ScreenplaySchema } from "@src/lib/screenplay/editor";
import { JSONContent } from "@tiptap/react";
import { createProject } from "@src/lib/utils/requests";
import { CreateProjectBody } from "@src/lib/utils/api-bodies";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { CookieUser } from "@src/lib/utils/types";
import { isTauri } from "@tauri-apps/api/core";

export interface ImportResult {
    success: boolean;
    projectId?: string;
    error?: string;
}

/**
 * Parse a file and extract screenplay content.
 * Returns the screenplay content array (guaranteed non-empty).
 */
async function parseFile(file: File): Promise<JSONContent[]> {
    const adapter = getAdapterByFilename(file.name);
    if (!adapter) {
        throw new Error(`Unsupported file type: ${file.name.split(".").pop()}`);
    }

    const content = await file.arrayBuffer();
    const projectData = adapter.convertFrom(content);

    if (!projectData.screenplay || projectData.screenplay.length === 0) {
        throw new Error("File appears to be empty or could not be parsed");
    }

    return projectData.screenplay;
}

/**
 * Create a Yjs document with screenplay content and save to local persistence.
 */
async function createLocalYjsDocument(
    projectId: string,
    screenplay: JSONContent[]
): Promise<void> {
    const ydoc = new ProjectState();

    // Convert the screenplay JSON to Yjs XmlFragment
    const docJson: JSONContent = {
        type: "doc",
        content: screenplay,
    };

    // Get the screenplay fragment from the ydoc
    const fragment = ydoc.screenplayFragment();

    // Use y-prosemirror to convert JSON to XmlFragment
    prosemirrorJSONToYXmlFragment(ScreenplaySchema, docJson, fragment);

    // Save to appropriate persistence based on environment
    if (isTauri()) {
        // Desktop: Use SQLite
        const persistence = new SqlitePersistence(projectId, ydoc);

        // Wait for initialization
        await new Promise<void>((resolve) => {
            persistence.on("synced", () => resolve());
        });

        // Force save
        await persistence.flush();
        persistence.destroy();
    } else {
        // Browser: Use IndexedDB
        const { IndexeddbPersistence } = await import("y-indexeddb");
        const persistence = new IndexeddbPersistence(`scriptio-${projectId}`, ydoc);

        // Wait for initialization
        await new Promise<void>((resolve) => {
            persistence.on("synced", () => resolve());
        });

        // IndexedDB persists automatically, just need to wait
        await new Promise((resolve) => setTimeout(resolve, 100));
        persistence.destroy();
    }

    ydoc.destroy();
}

/**
 * Create a remote project via API.
 */
async function createRemoteProject(
    userId: string,
    title: string,
    description?: string
): Promise<string> {
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
    title?: string
): Promise<ImportResult> {
    try {
        // Parse the file content
        const screenplay = await parseFile(file);

        // Create project title from filename if not provided
        const projectTitle = title || file.name.replace(/\.[^/.]+$/, "");

        let projectId: string;

        if (user && user.id) {
            // User is logged in - create remote project
            projectId = await createRemoteProject(user.id, projectTitle);
        } else {
            // Not logged in - create local-only project (desktop offline mode)
            const localProject = await createLocalProject(projectTitle);
            projectId = localProject.id;
        }

        // Create Yjs document with the screenplay content
        await createLocalYjsDocument(projectId, screenplay);

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
