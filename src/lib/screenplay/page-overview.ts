import type { Editor } from "@tiptap/core";

import { paginationKey } from "@src/lib/screenplay/extensions/pagination-extension";

/**
 * The document math behind the page-overview view: turning the pagination
 * plugin's break list into one document range per page, so each page can be
 * sliced out and rendered on its own.
 *
 * Kept out of the panel because it is a statement about the document rather
 * than about the grid that draws it — and because it is the half worth testing
 * without a browser's worth of React around it.
 */

/**
 * The shape this reader needs out of the pagination plugin's state. Declared
 * structurally (as the timeline does) rather than importing PaginationState,
 * which the extension keeps private.
 */
type PaginationSnapshot = {
    breaks?: { pos: number; pagenum: number; label?: string; splitNodeType: unknown }[];
    firstPageLabel?: string;
};

/** One page of the paginated script. */
export type PageEntry = {
    /** Document position the page starts at. */
    from: number;
    /** Document position the next page starts at (the doc end, for the last). */
    to: number;
    /** Where to put the caret when this page is opened in the editor. */
    caret: number;
    /** What the editor prints on the page — "12", or "12A" once pages are locked. */
    label: string;
};

/**
 * Slice the document into pages using the pagination plugin's break list — the
 * same source the timeline navigates by, so a page here is the page the editor
 * would scroll to.
 *
 * The ranges tile the document: every page begins where the previous one ended,
 * the first at the document start and the last at its end. A page whose break
 * falls mid-node (a sentence split) therefore ends inside that node, and the
 * next page begins inside it — which is exactly how the editor draws it.
 *
 * Always returns at least one page; a document with no breaks is one page long.
 */
export const readScriptPages = (editor: Editor): PageEntry[] => {
    const state = paginationKey.getState(editor.state) as PaginationSnapshot | undefined;
    const breaks = state?.breaks ?? [];
    const docSize = editor.state.doc.content.size;

    const pages: PageEntry[] = [];
    let from = 0;
    // Page 1 starts at the top of the document; position 1 is inside its first
    // block, where a boundary position would resolve to the editor container
    // and scroll nowhere (see focusOnPosition).
    let caret = 1;
    let label = state?.firstPageLabel ?? "1";

    for (const b of breaks) {
        // Clamped to the document. The pagination plugin recomputes its breaks
        // from the new doc inside the same `apply`, so these normally agree —
        // but it has several early-outs that keep the previous state across a
        // document change, and each one is only safe because the transactions
        // taking it happen to preserve positions. That is an invariant across
        // two modules with nothing enforcing it, and the cost of it lapsing
        // here would be a slice out of range taking the whole view down with
        // it. A page drawn slightly wrong for one frame is the better failure.
        const pos = Math.min(Math.max(b.pos, from), docSize);
        pages.push({ from, to: pos, caret, label });
        from = pos;
        // Same rule the timeline's page navigation uses: a whole-node break sits
        // on the boundary before the block that opens the page, while a sentence
        // split already sits inside the straddling text node.
        caret = b.splitNodeType === null ? pos + 1 : pos;
        label = b.label ?? String(b.pagenum);
    }
    pages.push({ from, to: docSize, caret, label });

    return pages;
};
