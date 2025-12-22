import { createContext, ReactNode, SetStateAction, useMemo, useState } from "react";
import { ScenesData } from "@src/lib/editor/screenplay";
import { CharacterMap } from "@src/lib/editor/characters";
import { ConnectionStatus } from "@src/lib/utils/enums";
import { Editor } from "@tiptap/react";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { Screenplay } from "@src/lib/utils/types";

const DEFAULT_SCREENPLAY: Screenplay = {
    type: "doc",
    attrs: {},
    content: [{ type: "paragraph", attrs: {} }],
};

export type ProjectContextType = {
    screenplay: Screenplay;
    updateScreenplay: (screenplay: Screenplay) => void;
    project: ProjectMembershipPayload | undefined;
    updateProject: (project: ProjectMembershipPayload | undefined) => void;
    editor: Editor | undefined;
    updateEditor: (editor: Editor) => void;
    scenesData: ScenesData;
    updateScenesData: (scenesData: ScenesData) => void;
    charactersData: CharacterMap;
    updateCharactersData: (charactersData: SetStateAction<CharacterMap>) => void;
    connectionStatus: ConnectionStatus;
    updateSaveStatus: (saveStatus: ConnectionStatus) => void;
};

const contextDefaults: ProjectContextType = {
    screenplay: DEFAULT_SCREENPLAY,
    updateScreenplay: () => {},
    project: undefined,
    updateProject: () => {},
    editor: undefined,
    updateEditor: () => {},
    scenesData: [],
    updateScenesData: () => {},
    charactersData: {},
    updateCharactersData: () => {},
    connectionStatus: ConnectionStatus.Online,
    updateSaveStatus: () => {},
};

export function ProjectContextProvider({ children }: { children: ReactNode }) {
    const [screenplay, setScreenplay] = useState<Screenplay>(DEFAULT_SCREENPLAY);
    const [project, setProject] = useState<ProjectMembershipPayload | undefined>(undefined);
    const [editor, setEditor] = useState<Editor | undefined>(undefined);
    const [scenesData, setScenesData] = useState<ScenesData>([]);
    const [charactersData, setCharactersData] = useState<CharacterMap>({});
    const [saveStatus, setSaveStatus] = useState<ConnectionStatus>(ConnectionStatus.Online);

    const updateScreenplay = (screenplay_: Screenplay) => {
        setScreenplay(screenplay_);
    };

    const updateProject = (project_: ProjectMembershipPayload | undefined) => {
        setProject(project_);
    };

    const updateEditor = (editor_: Editor) => {
        setEditor(editor_);
    };

    const updateScenesData = (scenesData: ScenesData) => {
        setScenesData(scenesData);
    };

    const updateCharactersData = (charactersData: SetStateAction<CharacterMap>) => {
        setCharactersData(charactersData);
    };

    const updateSaveStatus = (saveStatus_: ConnectionStatus) => {
        setSaveStatus(saveStatus_);
    };

    const value = useMemo(
        () => ({
            screenplay,
            updateScreenplay,
            project,
            updateProject,
            editor,
            updateEditor,
            scenesData,
            updateScenesData,
            charactersData,
            updateCharactersData,
            saveStatus,
            updateSaveStatus,
        }),
        [screenplay, project, editor, scenesData, charactersData, saveStatus]
    );

    return (
        <>
            <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
        </>
    );
}

export const ProjectContext = createContext<ProjectContextType>(contextDefaults);
