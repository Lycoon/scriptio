import { DocumentEditorConfig } from "../editor/document-editor-config";
import { BASE_EXTENSIONS } from "../screenplay/editor";

export function createShelfEditorConfig(nodeId: string, versionId: string): DocumentEditorConfig {
    return {
        type: "screenplay",
        baseExtensions: BASE_EXTENSIONS,
        getFragment: (s) => s.shelfFragment(nodeId, versionId),
        getCommentsMap: () => null,
        features: {
            comments: false,
            shelving: false,
            characterHighlights: false,
            searchHighlights: false,
            sceneBookmarks: false,
            sceneLocking: false,
            nodeIdDedup: true,
            suggestions: false,
            orphanPrevention: false,
            keybinds: false,
            fountain: false,
            contd: false,
            spellcheck: false,
            paginationMode: "screenplay",
        },
    };
}
