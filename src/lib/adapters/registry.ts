import { FadeInAdapter } from "./fadein/fadein-adapter";
import { FinalDraftAdapter } from "./fdx/finaldraft-adapter";
import { FountainAdapter } from "./fountain/fountain-adapter";
import { PDFAdapter } from "./pdf/pdf-adapter";
import { ProjectAdapter } from "./screenplay-adapter";
import { ScriptioAdapter } from "./scriptio/scriptio-adapter";
import { FormattedTextAdapter } from "./text/text-adapter";
import { WriterSoloAdapter } from "./writersolo/writersolo-adapter";
import { ExportFormat } from "@src/lib/utils/enums";

/**
 * Every file-format adapter, in the order their extensions are offered in file
 * dialogs. Reading and writing are keyed differently — a file extension for
 * import, an {@link ExportFormat} id for export — because the two are not always
 * the same string: `.txt` is written by formatted-text export but read as
 * Fountain. Each adapter declares both sides (`importExtensions`,
 * `exportTarget`), so this list is the only place an adapter is registered.
 */
const adapters: ProjectAdapter[] = [
    new FountainAdapter(),
    new FinalDraftAdapter(),
    new ScriptioAdapter(),
    new FadeInAdapter(),
    new WriterSoloAdapter(),
    new PDFAdapter(),
    new FormattedTextAdapter(),
];

/** Extension (lower-case, no dot) → adapter that reads it. */
const importAdapters = new Map<string, ProjectAdapter>();

/** Export format id → adapter that writes it. */
const exportAdapters = new Map<string, ProjectAdapter>();

for (const adapter of adapters) {
    // Two adapters claiming the same extension would make import routing depend
    // on registration order; registry.test.ts asserts that never happens.
    for (const extension of adapter.importExtensions) {
        importAdapters.set(extension.toLowerCase(), adapter);
    }
    if (adapter.exportTarget) exportAdapters.set(adapter.exportTarget.format, adapter);
}

/** Comma-separated `accept` list for a file input, e.g. ".fountain,.txt,.fdx". */
const SUPPORTED_IMPORT_EXTENSIONS = [...importAdapters.keys()].map((extension) => `.${extension}`).join(",");

/** Adapter that can READ `filename`, by its extension, or undefined if none can. */
export const getImportAdapterByFilename = (filename: string): ProjectAdapter | undefined => {
    const extension = filename.split(".").pop()?.toLowerCase();
    return extension ? importAdapters.get(extension) : undefined;
};

/** Adapter that WRITES `format`, or undefined when no adapter answers to it. */
export const getExportAdapter = (format: ExportFormat): ProjectAdapter | undefined => {
    return exportAdapters.get(format);
};

/** Extensions the import file pickers accept — every readable format, derived. */
export const getSupportedImportExtensions = (): string => SUPPORTED_IMPORT_EXTENSIONS;

/** Registered adapters, for tests and for UI that lists supported formats. */
export const getRegisteredAdapters = (): readonly ProjectAdapter[] => adapters;
