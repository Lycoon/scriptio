import type { JSONContent } from "@tiptap/core";
import { FountainAdapter } from "@src/lib/adapters/fountain/fountain-adapter";
import sampleFountainText from "../sample.fountain?raw";

let cachedLargeDoc: JSONContent[] | null = null;

/**
 * Parse sample.fountain once and cache the result.
 * FountainAdapter.convertFrom() is expensive — cache across bench iterations.
 */
export function largeDoc(): JSONContent[] {
    if (cachedLargeDoc) return cachedLargeDoc;
    const bytes = new TextEncoder().encode(sampleFountainText);
    const adapter = new FountainAdapter();
    const { screenplay } = adapter.convertFrom(bytes.buffer);
    cachedLargeDoc = screenplay ?? [];
    return cachedLargeDoc;
}

/** Minimal single-node document for empty-doc baseline cases. */
export function emptyDoc(): JSONContent[] {
    return [
        {
            type: "action",
            attrs: { "data-id": "bench-empty-001", class: "action" },
        },
    ];
}
