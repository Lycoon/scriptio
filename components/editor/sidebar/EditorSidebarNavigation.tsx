import { join } from "@src/lib/utils/misc";
import { useContext, useState } from "react";
import { ScreenplayContext } from "@src/context/ScreenplayContext";
import { UserContext } from "@src/context/UserContext";
import { ContextMenuType } from "./ContextMenu";
import { SceneItem } from "@src/lib/screenplay";
import { CharacterData } from "@src/lib/utils/characters";
import SidebarCharacterItem from "./SidebarCharacterItem";
import SidebarSceneItem from "./SidebarSceneItem";

import CharacterSVG from "../../../public/images/character.svg";
import LocationSVG from "../../../public/images/location.svg";

import sidebar from "./EditorSidebar.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";

type Props = {
    active: boolean;

    /* Editor actions */
    pasteText: (text: string) => void;
    getFocusOnPosition: (position: number) => void;
    selectTextInEditor: (start: number, end: number) => void;
    cutTextSelection: (start: number, end: number) => void;
    copyTextSelection: (start: number, end: number) => void;

    /* Characters */
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
    removeCharacter,
}: Props) => {
    const { scenesData, charactersData } = useContext(ScreenplayContext);
    const { updateContextMenu } = useContext(UserContext);
    const [menu, setMenu] = useState<NavigationMenu>(NavigationMenu.Characters);
    const isActive = active ? sidebar_nav.active : "";

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

    const activeCharactersMenu = isCharactersMenu ? sidebar_nav.active_tab : "";
    const activeLocationsMenu = isLocationsMenu ? sidebar_nav.active_tab : "";

    return (
        <div className={join(sidebar_nav.container, sidebar.shadow, isActive)}>
            <div>
                <div className={sidebar_nav.selection}>
                    <div
                        className={join(sidebar_nav.tab, activeCharactersMenu)}
                        onClick={() => setMenu(NavigationMenu.Characters)}
                    >
                        <CharacterSVG className={sidebar_nav.tab_img} />
                        <p className={sidebar_nav.list_title}>Characters</p>
                    </div>
                    <div
                        className={join(sidebar_nav.tab, activeLocationsMenu)}
                        onClick={() => setMenu(NavigationMenu.Locations)}
                    >
                        <LocationSVG className={sidebar_nav.tab_img} />
                        <p className={sidebar_nav.list_title}>Locations</p>
                    </div>
                </div>
                <div className={sidebar_nav.list}>
                    {menu === NavigationMenu.Characters &&
                        Object.entries(charactersData).map((character: any) => {
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
                    <div className={sidebar_nav.list_fill} onContextMenu={handleDropdownCharacterList} />
                </div>
            </div>
            <div>
                <p className={sidebar_nav.list_title}>Scenes</p>
                <div className={sidebar_nav.list + " " + sidebar_nav.scene_list}>
                    {scenesData.map((scene: SceneItem) => {
                        return (
                            <SidebarSceneItem
                                key={scene.position}
                                scene={scene}
                                focusOn={getFocusOnPosition}
                                selectTextInEditor={selectTextInEditor}
                                cutTextSelection={cutTextSelection}
                                copyTextSelection={copyTextSelection}
                            />
                        );
                    })}
                    <div className={sidebar_nav.list_fill} onContextMenu={handleDropdownSceneList} />
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarNavigation;
