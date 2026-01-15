import { FinalDraftAdapter } from "./fdx/finaldraft-adapter";
import { FountainAdapter } from "./fountain/fountain-adapter";
import { PDFAdapter } from "./pdf/pdf-adapter";
import { ProjectAdapter } from "./screenplay-adapter";
import { ScriptioAdapter } from "./scriptio/scriptio-adapter";

const adapterMap = new Map<string, ProjectAdapter>();
const registeredAdapters: ProjectAdapter[] = [
    new FountainAdapter(),
    new FinalDraftAdapter(),
    new PDFAdapter(),
    new ScriptioAdapter(),
];

registeredAdapters.forEach((adapter) => {
    adapterMap.set(adapter.extension.toLowerCase(), adapter);
});

export const getAdapterByFilename = (filename: string): ProjectAdapter | undefined => {
    const extension = filename.split(".").pop()?.toLowerCase();
    return getAdapterByExtension(extension);
};

export const getAdapterByExtension = (extension: string | undefined): ProjectAdapter | undefined => {
    return extension ? adapterMap.get(extension) : undefined;
};
