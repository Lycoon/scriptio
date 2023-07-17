import FileSaver from "file-saver";
import Router from "next/router";
import { useState } from "react";
import { convertToFountain } from "@src/converters/export/fountain";
import { exportToPDF } from "@src/converters/export/pdf";
import { useSettings, useUser } from "@src/lib/utils/hooks";
import CharacterExport from "./CharacterExport";
import FileFormatButtonExport from "./FileFormatButtonExport";
import Loading from "../../utils/Loading";
import { Project } from "@src/lib/utils/types";
import FormHeader from "../FormHeader";
import FormEnd from "../FormEnd";
import { getCharacterNames } from "@src/lib/utils/characters";

import layout from "../../utils/Layout.module.css";
import form from "../../utils/Form.module.css";
import settings_ from "../../settings/SettingsPageContainer.module.css";
import export_ from "./ExportProjectContainer.module.css";

import { redirectHome, redirectScreenplay } from "@src/lib/utils/redirects";
import { convertToFDX } from "@src/converters/export/fdx";

// ------------------------------ //
//              DATA              //
// ------------------------------ //
type Props = {
    project: Project;
};

export enum ExportFormat {
    PDF = "pdf",
    FOUNTAIN = "fountain",
    FDX = "fdx",
}

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

// ------------------------------ //
//            FUNCTIONS           //
// ------------------------------ //
const removeFromStateList = (list: any[], setList: (list: any[]) => void, item: string) => {
    const updated: any[] = [];
    list.forEach((e: any) => {
        if (e != item) {
            updated.push(e);
        }
    });

    setList(updated);
};

const addToStateList = (list: any[], setList: (list: any[]) => void, item: any) => {
    const updated = [...list];
    updated.push(item);

    setList(updated);
};

// ------------------------------ //
//           COMPONENTS           //
// ------------------------------ //
const ExportProjectConainer = ({ project }: Props) => {
    const { data: user, isLoading: isUserLoading } = useUser();
    if (!isUserLoading && (!user || !user.isLoggedIn)) {
        redirectHome();
    }

    const { data: settings, isLoading } = useSettings();
    const [exportFormat, setExportFormat] = useState<ExportFormat>(ExportFormat.PDF);
    const [includeWatermark, setIncludeWatermark] = useState<boolean>(false);
    const [includeNotes, setIncludeNotes] = useState<boolean>(false);
    const [allCharacters, setAllCharacters] = useState<boolean>(true);
    const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
    const [characters, setCharacters] = useState<string[]>(getCharacterNames(project.screenplay));

    if (!settings_ || isLoading) return <Loading />;

    const addCharacter = (name: string) => {
        addToStateList(selectedCharacters, setSelectedCharacters, name);
        removeFromStateList(characters, setCharacters, name);
    };

    const deleteCharacter = (name: string) => {
        removeFromStateList(selectedCharacters, setSelectedCharacters, name);
        addToStateList(characters, setCharacters, name);
    };

    const exportToFountain = (screenplay: any, exportData: ExportData) => {
        const fountain = convertToFountain(screenplay, exportData);
        const file = new File([fountain], exportData.title + ".fountain", {
            type: "text/plain;charset=utf-8",
        });
        FileSaver.saveAs(file);
    };

    const exportToFDX = (screenplay: any, exportData: ExportData) => {
        const fdx = convertToFDX(screenplay, exportData);
        const file = new File([fdx], exportData.title + ".fdx", {
            type: "text/plain;charset=utf-8",
        });
        FileSaver.saveAs(file);
    };

    const onSubmit = async (e: any) => {
        e.preventDefault();

        const exportData: ExportData = {
            title: project.title,
            author: user!.email,
            notes: includeNotes,
            notesColor: settings?.exportedNotesColor,
            characters: allCharacters ? undefined : selectedCharacters,
        };

        switch (exportFormat) {
            case ExportFormat.PDF:
                exportToPDF(project.screenplay, { ...exportData, watermark: includeWatermark });
                break;
            case ExportFormat.FOUNTAIN:
                exportToFountain(project.screenplay, exportData);
                break;
            case ExportFormat.FDX:
                exportToFDX(project.screenplay, exportData);
                break;
        }
    };

    return (
        <div className={layout.center_row}>
            <form className={form.container} onSubmit={onSubmit}>
                <FormHeader title="Export" formInfo={null} />

                <div className={form.elements}>
                    <div className={form.element}>
                        <div className={settings_.element_header}>
                            <p className={form.element_title}>File type format</p>
                            <select
                                onChange={(e: any) => {
                                    setExportFormat(e.target.value);
                                }}
                            >
                                <option value="pdf">PDF (.pdf)</option>
                                <option value="fountain">Fountain (.fountain)</option>
                                <option value="fdx">Final Draft (.fdx)</option>
                            </select>
                        </div>
                    </div>
                    {exportFormat === ExportFormat.PDF && (
                        <div className={form.element}>
                            <div className={settings_.element_header}>
                                <p className={form.element_title}>Watermark</p>
                                <input onChange={() => setIncludeWatermark(!includeWatermark)} type="checkbox" />
                            </div>
                        </div>
                    )}
                    <div className={form.element}>
                        <div className={settings_.element_header}>
                            <p className={form.element_title}>Include notes</p>
                            <input onChange={() => setIncludeNotes(!includeNotes)} type="checkbox" />
                        </div>
                    </div>
                    <div className={form.element}>
                        <div className={settings_.element_header}>
                            <p className={form.element_title}>All characters</p>
                            <div className={export_.characters_check}>
                                {!allCharacters && (
                                    <select
                                        className={export_.characters_dropdown}
                                        name="characters"
                                        onClick={(e: any) => {
                                            if (e.button != 0)
                                                // avoid adding value on unfolding dropdown
                                                addCharacter(e.target.value);
                                        }}
                                    >
                                        {characters.map((name: string) => {
                                            return (
                                                <option key={name} value={name}>
                                                    {name}
                                                </option>
                                            );
                                        })}
                                    </select>
                                )}
                                <input
                                    onChange={() => {
                                        setAllCharacters(!allCharacters);
                                    }}
                                    type="checkbox"
                                    defaultChecked
                                />
                            </div>
                        </div>
                        {!allCharacters && selectedCharacters.length > 0 && (
                            <div className={export_.characters_list}>
                                {selectedCharacters.map((name: string) => {
                                    return <CharacterExport key={name} name={name} deleteCharacter={deleteCharacter} />;
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <FormEnd submitText={"Export"} onBack={() => redirectScreenplay(project.id)} />
            </form>
        </div>
    );
};

export default ExportProjectConainer;
