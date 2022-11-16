import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../../src/context/UserContext";
import {
    CharacterData,
    CharacterMap,
    getCharactersData,
    getScenesData,
    SceneItem,
    ScenesData,
} from "../../../src/lib/screenplayUtils";
import { ContextMenuType } from "./ContextMenu";
import SidebarCharacterItem from "./SidebarCharacterItem";
import SidebarSceneItem from "./SidebarSceneItem";

type Props = {
    active: boolean;

    /* Editor actions */
    pasteText: (text: string) => void;
    getFocusOnPosition: (position: number) => void;
    selectTextInEditor: (start: number, end: number) => void;
    cutTextSelection: (start: number, end: number) => void;
    copyTextSelection: (start: number, end: number) => void;

    /* Characters */
    deferredCharactersUpdate: () => void;
    editCharacterPopup: (character: CharacterData) => void;
    addCharacterPopup: () => void;
    removeCharacter: (name: string) => void;
};

const enum NavigationMenu {
    Characters,
    Locations,
    Others,
}

const EditorSidebarNavigation = ({
    active,

    /* Editor actions */
    getFocusOnPosition,
    selectTextInEditor,
    cutTextSelection,
    pasteText,
    copyTextSelection,

    /* Characters */
    editCharacterPopup,
    addCharacterPopup,
    deferredCharactersUpdate,
    removeCharacter,
}: Props) => {
    const { updateContextMenu } = useContext(UserContext);
    const [scenes, setScenes] = useState<ScenesData>(getScenesData());
    const [characters, setCharacters] = useState<CharacterMap>(getCharactersData());
    const [menu, setMenu] = useState<NavigationMenu>(NavigationMenu.Characters);
    const isActive = active ? "navigation-on" : "";

    useEffect(() => {
        // update scene navigation when scenes change
        setScenes(getScenesData());
    }, [getScenesData()]);

    useEffect(() => {
        // update character navigation when characters change
        setCharacters(getCharactersData());
    }, [getCharactersData()]);

    const isCharactersMenu = menu === NavigationMenu.Characters;
    const isLocationsMenu = menu === NavigationMenu.Locations;
    const isOthersMenu = menu === NavigationMenu.Others;

    const handleDropdownSceneList = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.SceneList,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {},
        });
    };

    const handleDropdownCharacterList = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.CharacterList,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: { addCharacterPopup },
        });
    };

    return (
        <div className={`navigation-sidebar sidebar-shadow ${isActive}`}>
            <div>
                <div className="sidebar-selection">
                    <div
                        className={`nav-tab ${isCharactersMenu ? "active-nav-tab" : ""}`}
                        onClick={() => setMenu(NavigationMenu.Characters)}
                    >
                        <img className="nav-tab-icon" src={"/images/character.png"} />
                        <p className="nav-list-title">Characters</p>
                    </div>
                    <div
                        className={`nav-tab ${isLocationsMenu ? "active-nav-tab" : ""}`}
                        onClick={() => setMenu(NavigationMenu.Locations)}
                    >
                        <img className="nav-tab-icon" src={"/images/location.png"} />
                        <p className="nav-list-title">Locations</p>
                    </div>
                </div>
                <div className="nav-list">
                    {menu === NavigationMenu.Characters &&
                        Object.entries(characters).map((character: any) => {
                            return (
                                <SidebarCharacterItem
                                    key={character[0]}
                                    character={{
                                        // As we loop over entries of the character map, we get an array of [key, value]
                                        name: character[0],
                                        gender: character[1].gender,
                                        synopsis: character[1].synopsis,
                                    }}
                                    pasteText={pasteText}
                                    editCharacterPopup={editCharacterPopup}
                                    removeCharacter={removeCharacter}
                                />
                            );
                        })}
                    <div className="scene-list-fill" onContextMenu={handleDropdownCharacterList} />
                </div>
            </div>
            <div>
                <p className="nav-list-title">Scenes</p>
                <div className="nav-list scene-list">
                    {scenes.map((scene: SceneItem) => {
                        return (
                            <SidebarSceneItem
                                key={scene.position}
                                title={scene.title}
                                position={scene.position}
                                nextPosition={scene.nextPosition}
                                focusOn={getFocusOnPosition}
                                selectTextInEditor={selectTextInEditor}
                                cutTextSelection={cutTextSelection}
                                copyTextSelection={copyTextSelection}
                            />
                        );
                    })}
                    <div className="scene-list-fill" onContextMenu={handleDropdownSceneList} />
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarNavigation;
