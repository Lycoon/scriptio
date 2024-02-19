import { createContext, ReactNode, useState } from "react";
import { ScenesData } from "@src/lib/editor/screenplay";
import { CharacterMap } from "@src/lib/editor/characters";
import { SaveStatus } from "@src/lib/utils/enums";
import { Project } from "@src/lib/utils/types";

export type ProjectContextType = {
    project: Project | undefined;
    updateProject: (project: Project | undefined) => void;
    scenesData: ScenesData;
    updateScenesData: (scenesData: ScenesData) => void;
    charactersData: CharacterMap;
    updateCharactersData: (charactersData: CharacterMap) => void;
    saveStatus: SaveStatus;
    updateSaveStatus: (saveStatus: SaveStatus) => void;
};

const contextDefaults: ProjectContextType = {
    project: undefined,
    updateProject: () => {},
    scenesData: [],
    updateScenesData: () => {},
    charactersData: {},
    updateCharactersData: () => {},
    saveStatus: SaveStatus.Saved,
    updateSaveStatus: () => {},
};

export function ProjectContextProvider({ children }: { children: ReactNode }) {
    const [project, setProject] = useState<Project | undefined>(undefined);
    const [scenesData, setScenesData] = useState<ScenesData>([]);
    const [charactersData, setCharactersData] = useState<CharacterMap>({});
    const [saveStatus, setSaveStatus] = useState<SaveStatus>(SaveStatus.Saved);

    const updateProject = (project_: Project | undefined) => {
        setProject(project_);
    };

    const updateScenesData = (scenesData: ScenesData) => {
        setScenesData(scenesData);
    };

    const updateCharactersData = (charactersData: CharacterMap) => {
        setCharactersData(charactersData);
    };

    const updateSaveStatus = (saveStatus_: SaveStatus) => {
        setSaveStatus(saveStatus_);
    };

    const value = {
        project,
        updateProject,
        scenesData,
        updateScenesData,
        charactersData,
        updateCharactersData,
        saveStatus,
        updateSaveStatus,
    };

    return (
        <>
            <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
        </>
    );
}

export const ProjectContext = createContext<ProjectContextType>(contextDefaults);
