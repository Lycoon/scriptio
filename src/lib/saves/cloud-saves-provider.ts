/**
 * The cloud half of {@link SavesProvider}: an adapter over the existing REST
 * calls, which proxy to the `ProjectRoom` DurableObject. Nothing here decides
 * anything — the server owns authorization, Pro gating on manual saves, and the
 * restore that closes every collaborator's socket.
 */

import {
    createManualSave,
    deleteSave,
    listSaves,
    renameManualSave,
    restoreSave,
} from "../utils/requests";
import type { SavesProvider } from "./saves-provider";

export const cloudSavesProvider: SavesProvider = {
    list: (projectId) => listSaves(projectId),
    createManual: (projectId, name) => createManualSave(projectId, name),
    restore: async (projectId, key) => {
        await restoreSave(projectId, key);
    },
    renameManual: async (projectId, key, name) => {
        await renameManualSave(projectId, key, name);
    },
    remove: async (projectId, key) => {
        await deleteSave(projectId, key);
    },
};
