import type { JSONContent } from "@tiptap/core";
import { BASE_EXTENSIONS, SCREENPLAY_FORMATS } from "@src/lib/screenplay/editor";
import { ScriptioPagination } from "@src/lib/screenplay/extensions/pagination-extension";
import { createNodeIdDedupExtension } from "@src/lib/screenplay/extensions/node-id-dedup-extension";
import {
    createSearchHighlightExtension,
} from "@src/lib/screenplay/extensions/search-highlight-extension";
import { ScreenplayElement } from "@src/lib/utils/enums";
import { createTestEditor } from "../helpers/editor-factory";
import { pluginBenchSuite } from "../helpers/bench-suite";

const ALL_FILTERS = new Set(Object.values(ScreenplayElement));

function makeEditorNoSearch(content: JSONContent[]) {
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
            createSearchHighlightExtension({
                getSearchTerm: () => "",
                getEnabledFilters: () => ALL_FILTERS,
                getCurrentMatchIndex: () => 0,
                onMatchesFound: () => {},
            }),
        ],
        content,
    );
}

function makeEditorActiveSearch(content: JSONContent[]) {
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
            // "the" is common — many matches, exercises the incremental-scan path
            createSearchHighlightExtension({
                getSearchTerm: () => "the",
                getEnabledFilters: () => ALL_FILTERS,
                getCurrentMatchIndex: () => 0,
                onMatchesFound: () => {},
            }),
        ],
        content,
    );
}

pluginBenchSuite("search-highlight — no active search", makeEditorNoSearch);
pluginBenchSuite('search-highlight — active search "the"', makeEditorActiveSearch);
