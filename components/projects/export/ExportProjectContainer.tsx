import FileSaver from "file-saver";
import Link from "next/link";
import Router from "next/router";
import { useState } from "react";
import { convertJSONtoFountain } from "../../../src/converters/scriptio_to_fountain";
import { exportToPDF } from "../../../src/converters/scriptio_to_pdf";
import { useSettings, useUser } from "../../../src/lib/utils/hooks";
import CharacterExport from "./CharacterExport";
import FileFormatButtonExport from "./FileFormatButtonExport";
import Loading from "../../home/Loading";
import { Project } from "../../../src/lib/utils/types";
import { getCharacterNames } from "../../../src/lib/utils/characters";

type Props = {
    project: Project;
};

export type ExportData = {
    title: string;
    author: string;
    watermark: boolean;
    notes: boolean;
    notesColor?: string;
    characters?: string[];
};

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

const ExportProjectConainer = ({ project }: Props) => {
    const { data: user, isLoading: isUserLoading } = useUser();
    if (!isUserLoading && (!user || !user.isLoggedIn)) {
        Router.push("/");
    }

    const { data: settings, isLoading } = useSettings();
    const [isPdfExport, setPdfExport] = useState<boolean>(true);
    const [includeWatermark, setIncludeWatermark] = useState<boolean>(false);
    const [includeNotes, setIncludeNotes] = useState<boolean>(false);
    const [allCharacters, setAllCharacters] = useState<boolean>(true);
    const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
    const [characters, setCharacters] = useState<string[]>(getCharacterNames(project.screenplay));

    if (!settings || isLoading) return <Loading />;

    const addCharacter = (name: string) => {
        addToStateList(selectedCharacters, setSelectedCharacters, name);
        removeFromStateList(characters, setCharacters, name);
    };

    const deleteCharacter = (name: string) => {
        removeFromStateList(selectedCharacters, setSelectedCharacters, name);
        addToStateList(characters, setCharacters, name);
    };

    const exportFountain = (screenplay: any, exportData: ExportData) => {
        const fountain = convertJSONtoFountain(screenplay, exportData);
        const file = new File([fountain], exportData.title + ".fountain", {
            type: "text/plain;charset=utf-8",
        });
        FileSaver.saveAs(file);
    };

    const onSubmit = async (e: any) => {
        e.preventDefault();

        if (isPdfExport) {
            exportToPDF(project.screenplay, {
                title: project.title,
                author: user!.email,
                watermark: includeWatermark,
                notes: includeNotes,
                notesColor: settings.exportedNotesColor,
                characters: allCharacters ? undefined : selectedCharacters,
            });
        } else {
            exportFountain(project.screenplay, {
                title: project.title,
                author: user!.email,
                watermark: includeWatermark,
                notes: includeNotes,
                characters: allCharacters ? undefined : selectedCharacters,
            });
        }
    };

    return (
        <div className="project-form-container">
            <form className="project-form">
                <div>
                    <h1>Export</h1>
                    <hr />
                </div>

                <div className="export-project-form">
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>File type format</p>
                            <div className="export-project-formats">
                                <FileFormatButtonExport
                                    content=".fountain"
                                    isPdfExport={!isPdfExport}
                                    action={() => setPdfExport(false)}
                                />
                                <FileFormatButtonExport
                                    content=".pdf"
                                    isPdfExport={isPdfExport}
                                    action={() => setPdfExport(true)}
                                />
                            </div>
                        </div>
                    </div>
                    {isPdfExport && (
                        <div className="settings-element">
                            <div className="settings-element-header">
                                <p>Watermark</p>
                                <input
                                    onChange={() => setIncludeWatermark(!includeWatermark)}
                                    type="checkbox"
                                />
                            </div>
                        </div>
                    )}
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Include notes</p>
                            <input
                                onChange={() => setIncludeNotes(!includeNotes)}
                                type="checkbox"
                            />
                        </div>
                    </div>
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>All characters</p>
                            <div className="export-characters-checkbox">
                                {!allCharacters && (
                                    <select
                                        className="export-characters-dropdown"
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
                            <div className="export-characters-list">
                                {selectedCharacters.map((name: string) => {
                                    return (
                                        <CharacterExport
                                            key={name}
                                            name={name}
                                            deleteCharacter={deleteCharacter}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="project-form-end">
                    <Link legacyBehavior href={`/projects/${project.id}/screenplay`}>
                        <a className="form-btn back-btn">Back</a>
                    </Link>
                    <button
                        className="form-btn project-form-submit-btn"
                        onClick={onSubmit}
                        type="submit"
                    >
                        Export
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ExportProjectConainer;
