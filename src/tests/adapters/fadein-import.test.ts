import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/react";
import * as fflate from "fflate";

import { FadeInAdapter } from "@src/lib/adapters/fadein/fadein-adapter";

/** Wrap an OSF document.xml string into a `.fadein` ZIP buffer. */
const toFadeIn = (xml: string): ArrayBuffer => {
    const zip = fflate.zipSync({ "document.xml": fflate.strToU8(xml) });
    return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
};

const DOC = `<?xml version="1.0" encoding="UTF-8"?>
<document type="Open Screenplay Format document" version="40">
  <paragraphs>
    <para>
      <style basestyle="Scene Heading"/>
      <text>INT. WILL'S BEDROOM - NIGHT (1973)</text>
    </para>
    <para>
      <style basestyle="Character"/>
      <text>EDWARD (V.O.)</text>
    </para>
    <para>
      <style basestyle="Dialogue"/>
      <text>No Dad, they don't.  </text>
      <text underline="1">I</text>
      <text> do not like the story.</text>
    </para>
    <para>
      <style basestyle="Action" pagebreakbefore="1"/>
      <text bold="1">FADE IN:</text>
    </para>
    <para>
      <style basestyle="Transition"/>
      <text>CUT TO:</text>
    </para>
  </paragraphs>
  <titlepage>
    <para>
      <style basestyle="Normal Text"/>
      <text>BIG FISH</text>
    </para>
    <para>
      <style basestyle="Normal Text"/>
      <text></text>
    </para>
  </titlepage>
</document>`;

describe("FadeIn adapter import", () => {
    const { screenplay, titlepage } = new FadeInAdapter().convertFrom(toFadeIn(DOC));
    const nodes = screenplay as JSONContent[];

    it("maps OSF basestyles to Scriptio node types", () => {
        expect(nodes.map((n) => n.type)).toEqual([
            "scene",
            "character",
            "dialogue",
            "action",
            "transition",
        ]);
        // attrs.class mirrors the node type.
        expect(nodes.every((n) => n.attrs?.class === n.type)).toBe(true);
    });

    it("splits a multi-run paragraph into text nodes, preserving marks and spacing", () => {
        const dialogue = nodes[2];
        expect(dialogue.content).toHaveLength(3);
        // Inter-run whitespace (the double space after the sentence) is preserved.
        expect(dialogue.content?.map((c) => c.text)).toEqual([
            "No Dad, they don't.  ",
            "I",
            " do not like the story.",
        ]);
        // Only the middle run is underlined.
        expect(dialogue.content?.[0].marks).toBeUndefined();
        expect(dialogue.content?.[1].marks).toEqual([{ type: "underline" }]);
        expect(dialogue.content?.[2].marks).toBeUndefined();
    });

    it("carries bold formatting through as a mark", () => {
        expect(nodes[3].content?.[0]).toMatchObject({
            text: "FADE IN:",
            marks: [{ type: "bold" }],
        });
    });

    it("turns pagebreakbefore into the pageBreak attribute", () => {
        expect(nodes[3].attrs?.pageBreak).toBe(true);
        expect(nodes[0].attrs?.pageBreak).toBeFalsy();
    });

    it("imports the title page as tp-text lines, keeping blank lines as empty nodes", () => {
        const tp = titlepage as JSONContent[];
        expect(tp).toHaveLength(2);
        // Title page lines must use the title-page schema node, not screenplay nodes.
        expect(tp.every((n) => n.type === "tp-text")).toBe(true);
        expect(tp[0].content?.[0].text).toBe("BIG FISH");
        expect(tp[1].content).toEqual([]);
    });

    it("throws a clear error when document.xml is missing", () => {
        const empty = fflate.zipSync({ "other.txt": fflate.strToU8("x") });
        const buffer = empty.buffer.slice(empty.byteOffset, empty.byteOffset + empty.byteLength) as ArrayBuffer;
        expect(() => new FadeInAdapter().convertFrom(buffer)).toThrow(/document\.xml/);
    });
});
