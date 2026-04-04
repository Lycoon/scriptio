/**
 * Cached projects persistence facade.
 * Delegates to the appropriate StorageProvider (IndexedDB on browser, SQLite on Tauri).
 *
 * This file preserves the public API consumed by all components and hooks.
 */

import type { UserSettings } from "@src/lib/utils/types";
import { getStorageProvider, type CachedProject, type ProjectEntryInput } from "./storage-provider";

export type { CachedProject };

// ── Public API ────────────────────────────────────────────────────────────────

export function generateCachedProjectId(): string {
    return crypto.randomUUID();
}

export async function createCachedProject(title: string, description?: string, author?: string): Promise<CachedProject> {
    const id = generateCachedProjectId();
    const provider = await getStorageProvider();
    await provider.createProject(id, title, description, false, author);
    return (await provider.get(id))!;
}

export async function createCachedProjectWithId(
    id: string,
    title: string,
    description?: string,
    synced: boolean = false,
    author?: string,
): Promise<CachedProject> {
    const provider = await getStorageProvider();
    await provider.createProject(id, title, description, synced, author);
    return (await provider.get(id))!;
}

export async function getCachedProjects(): Promise<CachedProject[]> {
    return (await getStorageProvider()).getAll();
}

export async function getCachedProject(id: string): Promise<CachedProject | null> {
    return (await getStorageProvider()).get(id);
}

export async function updateCachedProject(
    id: string,
    updates: { title?: string; description?: string; author?: string },
): Promise<void> {
    return (await getStorageProvider()).update(id, updates);
}

export async function touchCachedProject(id: string): Promise<void> {
    return (await getStorageProvider()).touch(id);
}

export async function deleteCachedProject(id: string): Promise<void> {
    return (await getStorageProvider()).delete(id);
}

export async function isCachedProject(projectId: string): Promise<boolean> {
    return cachedProjectExists(projectId);
}

export async function isLocalOnlyProject(id: string): Promise<boolean> {
    return (await getStorageProvider()).get(id).then((p) => p?.isLocalOnly ?? false);
}

export async function cachedProjectExists(id: string): Promise<boolean> {
    return (await getStorageProvider()).exists(id);
}

export async function ensureCachedEntries(projects: ProjectEntryInput[]): Promise<void> {
    if (projects.length === 0) return;
    return (await getStorageProvider()).ensureEntries(projects);
}

// ── Settings persistence ──────────────────────────────────────────────────────

export async function getPersistedSettings(): Promise<Partial<UserSettings>> {
    return (await getStorageProvider()).getSettings();
}

export async function persistSettings(updates: Partial<UserSettings>): Promise<void> {
    return (await getStorageProvider()).saveSettings(updates);
}
