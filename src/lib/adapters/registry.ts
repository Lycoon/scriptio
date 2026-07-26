import { FadeInAdapter } from "./fadein/fadein-adapter";
import { FinalDraftAdapter } from "./fdx/finaldraft-adapter";
import { FountainAdapter } from "./fountain/fountain-adapter";
import { PDFAdapter } from "./pdf/pdf-adapter";
import { ProjectAdapter } from "./screenplay-adapter";
import { ScriptioAdapter } from "./scriptio/scriptio-adapter";
import { FormattedTextAdapter } from "./text/text-adapter";
import { WriterSoloAdapter } from "./writersolo/writersolo-adapter";

const adapterMap = new Map<string, ProjectAdapter>();
const registeredAdapters: ProjectAdapter[] = [
    new FountainAdapter(),
    new FinalDraftAdapter(),
    new PDFAdapter(),
    new ScriptioAdapter(),
    new FadeInAdapter(),
    new WriterSoloAdapter(),
];

registeredAdapters.forEach((adapter) => {
    adapterMap.set(adapter.extension.toLowerCase(), adapter);
});

// `.txt` files commonly contain plain Fountain markup, so treat them as Fountain.
adapterMap.set("txt", new FountainAdapter());

// Export-only adapters, keyed by their `ExportFormat` id rather than by file
// extension: `.txt` is claimed by Fountain on import (see above), so the
// formatted-text exporter cannot own that key in `adapterMap`.
const exportAdapterMap = new Map<string, ProjectAdapter>([["text", new FormattedTextAdapter()]]);

export const getAdapterByFilename = (filename: string): ProjectAdapter | undefined => {
    const extension = filename.split(".").pop()?.toLowerCase();
    return getAdapterByExtension(extension);
};

export const getAdapterByExtension = (extension: string | undefined): ProjectAdapter | undefined => {
    return extension ? adapterMap.get(extension) : undefined;
};

/** Adapter used to WRITE an `ExportFormat`, which is not always a file extension. */
export const getExportAdapter = (format: string): ProjectAdapter | undefined => {
    return exportAdapterMap.get(format) ?? adapterMap.get(format);
};
