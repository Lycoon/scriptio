import { createContext, ReactNode, useState } from "react";
import { ScenesData } from "@src/lib/editor/screenplay";
import { CharacterMap } from "@src/lib/editor/characters";

export type PopupContextType = {
    scenesData: ScenesData;
    updateScenesData: (scenesData: ScenesData) => void;
    charactersData: CharacterMap;
    updateCharactersData: (charactersData: CharacterMap) => void;
};

const contextDefaults: PopupContextType = {
    scenesData: [],
    updateScenesData: () => {},
    charactersData: {},
    updateCharactersData: () => {},
};

export function PopupContextProvider({ children }: { children: ReactNode }) {
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
            <PopupContext.Provider value={value}>{children}</PopupContext.Provider>
        </>
    );
}

export const PopupContext = createContext<PopupContextType>(contextDefaults);
