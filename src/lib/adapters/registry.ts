import { FadeInAdapter } from "./fadein/fadein-adapter";
import { FinalDraftAdapter } from "./fdx/finaldraft-adapter";
import { FountainAdapter } from "./fountain/fountain-adapter";
import { PDFAdapter } from "./pdf/pdf-adapter";
import { ProjectAdapter } from "./screenplay-adapter";
import { ScriptioAdapter } from "./scriptio/scriptio-adapter";
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

export const getAdapterByFilename = (filename: string): ProjectAdapter | undefined => {
    const extension = filename.split(".").pop()?.toLowerCase();
    return getAdapterByExtension(extension);
};

export const getAdapterByExtension = (extension: string | undefined): ProjectAdapter | undefined => {
    return extension ? adapterMap.get(extension) : undefined;
};
