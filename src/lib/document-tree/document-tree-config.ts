import { DocumentEditorConfig } from "../editor/document-editor-config";
import { BASE_EXTENSIONS } from "../screenplay/editor";

/**
 * Editor config for a document-tree `editor` node. Mirrors the shelf editor
 * config but binds to the node's own `documentFragment(docId)` so each
 * document edits its own isolated Y.XmlFragment.
 */
export function createDocumentTreeConfig(docId: string): DocumentEditorConfig {
    return {
        type: "screenplay",
        baseExtensions: BASE_EXTENSIONS,
        getFragment: (s) => s.documentFragment(docId),
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
