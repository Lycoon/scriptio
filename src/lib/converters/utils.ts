export type ExportData = {
    title: string;
    author: string;
    notes: boolean;
    characters?: string[]; // undefined means all characters
    notesColor?: string;
};

export type ExportDataPDF = ExportData & {
    watermark: boolean;
};