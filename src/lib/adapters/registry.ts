import { FinalDraftAdapter } from "./fdx/finaldraft-adapter";
import { FountainAdapter } from "./fountain/fountain-adapter";
import { PDFAdapter } from "./pdf/pdf-adapter";
import { ScreenplayAdapter } from "./screenplay-adapter";

const registeredAdapters: ScreenplayAdapter[] = [new FountainAdapter(), new FinalDraftAdapter(), new PDFAdapter()];
const adapterMap = new Map<string, ScreenplayAdapter>();

registeredAdapters.forEach((adapter) => {
    adapterMap.set(adapter.extension.toLowerCase(), adapter);
});

export const getAdapterByFilename = (filename: string): ScreenplayAdapter | undefined => {
    const extension = filename.split(".").pop()?.toLowerCase();
    return getAdapterByExtension(extension);
};

export const getAdapterByExtension = (extension: string | undefined): ScreenplayAdapter | undefined => {
    return extension ? adapterMap.get(extension) : undefined;
};
