import { UserSettings } from "./types";

export const DEFAULT_LOCAL_SETTINGS: UserSettings = {
    keybinds: {},
    theme: "dark",
    language: "en",
    themedEditor: false,
    highlightOnHover: false,
};

export async function readLocalSettings(): Promise<UserSettings> {
    try {
        const { getPersistedSettings } = await import("../persistence/storage-provider/local-persistence");
        const stored = await getPersistedSettings();
        return { ...DEFAULT_LOCAL_SETTINGS, ...stored };
    } catch {
        return DEFAULT_LOCAL_SETTINGS;
    }
}

export async function writeLocalSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
    const current = await readLocalSettings();
    const updated = { ...current, ...updates };
    try {
        const { persistSettings } = await import("../persistence/storage-provider/local-persistence");
        await persistSettings(updates);
    } catch (err) {
        console.error("[local-settings] Failed to save:", err);
    }
    return updated;
}
