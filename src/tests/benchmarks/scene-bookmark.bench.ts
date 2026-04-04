import type { JSONContent } from "@tiptap/core";
import { BASE_EXTENSIONS, SCREENPLAY_FORMATS } from "@src/lib/screenplay/editor";
import { ScriptioPagination } from "@src/lib/screenplay/extensions/pagination-extension";
import { createNodeIdDedupExtension } from "@src/lib/screenplay/extensions/node-id-dedup-extension";
import { createSceneBookmarkExtension } from "@src/lib/screenplay/extensions/scene-bookmark-extension";
import { createTestEditor } from "../helpers/editor-factory";
import { pluginBenchSuite } from "../helpers/bench-suite";

function makeEditor(content: JSONContent[]) {
    return createTestEditor(
        [
            ...BASE_EXTENSIONS,
            ScriptioPagination.configure({
                pageGap: 20,
                headerRight: `<p class="page-number" style="margin-top: 50px;">{page}.</p>`,
                customHeader: {
                    1: {
                        headerLeft: "",
                        headerRight: `<p class="page-number" style="margin-top: 50px;"></p>`,
                    },
                },
                footerRight: "",
                ...SCREENPLAY_FORMATS.LETTER,
            }),
            createNodeIdDedupExtension({ duplicatePersistentScene: () => {} }),
            // All scenes colored — worst case for decoration count
            createSceneBookmarkExtension({
                getSceneColor: () => "#f59e0b",
            }),
        ],
        content,
    );
}

pluginBenchSuite("scene-bookmark — apply() timing", makeEditor);
