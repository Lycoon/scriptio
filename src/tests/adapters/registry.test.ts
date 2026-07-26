import { describe, expect, it } from "vitest";

import {
    getExportAdapter,
    getImportAdapterByFilename,
    getRegisteredAdapters,
    getSupportedImportExtensions,
} from "@src/lib/adapters/registry";
import { FountainAdapter } from "@src/lib/adapters/fountain/fountain-adapter";
import { FormattedTextAdapter } from "@src/lib/adapters/text/text-adapter";
import { PDFAdapter } from "@src/lib/adapters/pdf/pdf-adapter";
import { ExportFormat } from "@src/lib/utils/enums";
import { ProjectState } from "@src/lib/project/project-state";

/**
 * The registry keys reading by file extension and writing by `ExportFormat` id,
 * because `.txt` means different things in each direction: it is written by the
 * formatted-text exporter but read as Fountain. These tests pin that down, plus
 * the invariants that keep the two maps unambiguous as adapters are added.
 */
describe("adapter registry", () => {
    describe("import routing", () => {
        it("reads both .fountain and .txt as Fountain", () => {
            expect(getImportAdapterByFilename("script.fountain")).toBeInstanceOf(FountainAdapter);
            expect(getImportAdapterByFilename("script.txt")).toBeInstanceOf(FountainAdapter);
            // Same instance: one adapter owns both extensions, not two copies.
            expect(getImportAdapterByFilename("script.txt")).toBe(getImportAdapterByFilename("a.fountain"));
        });

        it("ignores extension case and earlier dots in the name", () => {
            expect(getImportAdapterByFilename("SCRIPT.TXT")).toBeInstanceOf(FountainAdapter);
            expect(getImportAdapterByFilename("my.draft.v2.Fountain")).toBeInstanceOf(FountainAdapter);
        });

        it("routes the other readable formats to their own adapters", () => {
            for (const [filename, extension] of [
                ["a.fdx", "fdx"],
                ["a.scriptio", "scriptio"],
                ["a.fadein", "fadein"],
                ["a.wdz", "wdz"],
            ] as const) {
                expect(getImportAdapterByFilename(filename)?.importExtensions, filename).toContain(extension);
            }
        });

        it("claims nothing for export-only or unknown formats", () => {
            expect(getImportAdapterByFilename("a.pdf")).toBeUndefined();
            expect(getImportAdapterByFilename("a.docx")).toBeUndefined();
            expect(getImportAdapterByFilename("noextension")).toBeUndefined();
            expect(getImportAdapterByFilename("")).toBeUndefined();
        });
    });

    describe("export routing", () => {
        it("resolves every format the UI can ask for", () => {
            for (const format of Object.values(ExportFormat)) {
                expect(getExportAdapter(format), format).toBeDefined();
            }
        });

        it("gives formatted text the .txt writer, not the Fountain reader", () => {
            const adapter = getExportAdapter(ExportFormat.TEXT);
            expect(adapter).toBeInstanceOf(FormattedTextAdapter);
            expect(adapter?.exportTarget?.extension).toBe("txt");
            expect(getExportAdapter(ExportFormat.FOUNTAIN)).toBeInstanceOf(FountainAdapter);
            expect(getExportAdapter(ExportFormat.PDF)).toBeInstanceOf(PDFAdapter);
        });

        it("does not expose import-only adapters as export targets", () => {
            // FadeIn / WriterSolo cannot be written; their ids must not resolve,
            // even though those strings are valid import extensions.
            expect(getExportAdapter("fadein" as ExportFormat)).toBeUndefined();
            expect(getExportAdapter("wdz" as ExportFormat)).toBeUndefined();
            // ...and "txt" is an extension, never an export id.
            expect(getExportAdapter("txt" as ExportFormat)).toBeUndefined();
        });
    });

    describe("invariants", () => {
        it("has no two adapters claiming the same import extension", () => {
            const owners = new Map<string, string>();
            for (const adapter of getRegisteredAdapters()) {
                for (const extension of adapter.importExtensions) {
                    const key = extension.toLowerCase();
                    expect(owners.has(key), `.${key} claimed by both ${owners.get(key)} and ${adapter.label}`).toBe(
                        false,
                    );
                    owners.set(key, adapter.label);
                }
            }
        });

        it("has no two adapters claiming the same export format", () => {
            const owners = new Map<string, string>();
            for (const adapter of getRegisteredAdapters()) {
                const format = adapter.exportTarget?.format;
                if (!format) continue;
                expect(
                    owners.has(format),
                    `${format} claimed by both ${owners.get(format)} and ${adapter.label}`,
                ).toBe(false);
                owners.set(format, adapter.label);
            }
        });

        it("declares extensions bare and lower-case", () => {
            for (const adapter of getRegisteredAdapters()) {
                const written = adapter.exportTarget ? [adapter.exportTarget.extension] : [];
                for (const extension of [...written, ...adapter.importExtensions]) {
                    expect(extension, adapter.label).toBeTruthy();
                    expect(extension, adapter.label).toBe(extension.toLowerCase());
                    expect(extension.startsWith("."), adapter.label).toBe(false);
                }
            }
        });

        it("names exported files with the written extension, not the export id", () => {
            // Formatted text answers to "text" but must write a .txt file, so the
            // two halves of an ExportTarget are never interchangeable.
            for (const [format, extension] of [
                [ExportFormat.PDF, "pdf"],
                [ExportFormat.FOUNTAIN, "fountain"],
                [ExportFormat.FDX, "fdx"],
                [ExportFormat.TEXT, "txt"],
                [ExportFormat.SCRIPTIO, "scriptio"],
            ] as const) {
                expect(getExportAdapter(format)?.exportTarget?.extension, format).toBe(extension);
            }
        });

        it("keeps every adapter reachable in at least one direction", () => {
            for (const adapter of getRegisteredAdapters()) {
                const reachable = adapter.importExtensions.length > 0 || adapter.exportTarget !== null;
                expect(reachable, `${adapter.label} can neither be imported nor exported`).toBe(true);
            }
        });

        it("refuses to export an import-only format with a readable error", async () => {
            // The guard in `export()` fires before anything touches a filename.
            const fadeIn = getImportAdapterByFilename("a.fadein")!;
            expect(fadeIn.exportTarget).toBeNull();
            await expect(
                fadeIn.export(new ProjectState(), {
                    title: "T",
                    author: "a@b.c",
                    includeNotes: false,
                }),
            ).rejects.toThrow(/cannot be exported/);
        });

        it("refuses to read the formats it only writes", () => {
            const empty = new ArrayBuffer(0);
            expect(() => new PDFAdapter().convertFrom(empty)).toThrow();
            expect(() => new FormattedTextAdapter().convertFrom(empty)).toThrow();
        });
    });

    describe("file picker accept list", () => {
        it("offers exactly the readable extensions", () => {
            const accepted = getSupportedImportExtensions().split(",");
            const declared = getRegisteredAdapters().flatMap((a) => a.importExtensions.map((e) => `.${e}`));
            expect([...accepted].sort()).toEqual([...declared].sort());
        });

        it("includes .txt and .fountain and excludes what cannot be read", () => {
            const accepted = getSupportedImportExtensions();
            expect(accepted).toContain(".fountain");
            expect(accepted).toContain(".txt");
            expect(accepted).not.toContain(".pdf");
        });
    });
});
