import autoAnimate from "@formkit/auto-animate";
import FileSaver from "file-saver";
import Router from "next/router";
import { useContext, useEffect, useRef, useState } from "react";
import { Project, CookieUser } from "../../../pages/api/users";
import { UserContext } from "../../../src/context/UserContext";
import { convertJSONtoFountain } from "../../../src/converters/scriptio_to_fountain";
import { exportToPDF } from "../../../src/converters/scriptio_to_pdf";
import { getCharacterNames } from "../../../src/lib/statistics";
import CharacterExport from "./CharacterExport";
import FileFormatButtonExport from "./FileFormatButtonExport";

type Props = {
    project: Project;
    user: CookieUser;
};

const removeFromStateList = (
    list: any[],
    setList: (list: any[]) => void,
    item: string
) => {
    const updated: any[] = [];
    list.forEach((e: any) => {
        if (e != item) {
            updated.push(e);
        }
    });

    setList(updated);
};

const addToStateList = (
    list: any[],
    setList: (list: any[]) => void,
    item: any
) => {
    const updated = [...list];
    updated.push(item);

    setList(updated);
};

const ExportProjectConainer = ({ project, user }: Props) => {
    const { editor } = useContext(UserContext);
    const [isPdfExport, setPdfExport] = useState<boolean>(true);
    const [allCharacters, setAllCharacters] = useState<boolean>(true);
    const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
    const [characters, setCharacters] = useState<string[]>(
        getCharacterNames(project.screenplay)
    );

    const addCharacter = (name: string) => {
        addToStateList(selectedCharacters, setSelectedCharacters, name);
        removeFromStateList(characters, setCharacters, name);
    };

    const deleteCharacter = (name: string) => {
        removeFromStateList(selectedCharacters, setSelectedCharacters, name);
        addToStateList(characters, setCharacters, name);
    };

    const exportPDF = () => {
        exportToPDF(project.title, user.email, project.screenplay);
    };

    const exportFountain = () => {
        const fountain = convertJSONtoFountain(project.screenplay);
        const file = new File([fountain], project.title + ".fountain", {
            type: "text/plain;charset=utf-8",
        });
        FileSaver.saveAs(file);
    };

    const backToScreenplay = () => {
        Router.push(`/projects/${project.id}/screenplay`);
    };

    const onSubmit = async (e: any) => {
        e.preventDefault();

        if (isPdfExport) {
            exportPDF();
        } else {
            exportFountain();
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
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Include notes</p>
                            <input type="checkbox" />
                        </div>
                    </div>
                    <div className="settings-element">
                        <div className="settings-element-header">
                            <p>Watermark</p>
                            <input type="checkbox" />
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
                                        onChange={(e) => {
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
                                    onChange={() =>
                                        setAllCharacters(!allCharacters)
                                    }
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
                    <button
                        className="form-btn back-btn"
                        onClick={backToScreenplay}
                    >
                        Back
                    </button>
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
