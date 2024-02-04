import { createContext, ReactNode, useState } from "react";
import { ScenesData } from "@src/lib/editor/screenplay";
import { CharacterMap } from "@src/lib/editor/characters";

export type ScreenplayContextType = {
    scenesData: ScenesData;
    updateScenesData: (scenesData: ScenesData) => void;
    charactersData: CharacterMap;
    updateCharactersData: (charactersData: CharacterMap) => void;
};

const contextDefaults: ScreenplayContextType = {
    scenesData: [],
    updateScenesData: () => {},
    charactersData: {},
    updateCharactersData: () => {},
};

export function ScreenplayContextProvider({ children }: { children: ReactNode }) {
    const [scenesData, setScenesData] = useState<ScenesData>([]);
    const [charactersData, setCharactersData] = useState<CharacterMap>({});

    const updateScenesData = (scenesData: ScenesData) => {
        setScenesData(scenesData);
    };

    const updateCharactersData = (charactersData: CharacterMap) => {
        setCharactersData(charactersData);
    };

    const value = {
        scenesData,
        updateScenesData,
        charactersData,
        updateCharactersData,
    };

    return (
        <>
            <ScreenplayContext.Provider value={value}>{children}</ScreenplayContext.Provider>
        </>
    );
}

export const ScreenplayContext = createContext<ScreenplayContextType>(contextDefaults);
