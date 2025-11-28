import { join } from "@src/lib/utils/misc";
import { useContext, useState } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { ContextMenuType } from "./ContextMenu";
import { SceneItem } from "@src/lib/editor/screenplay";
import SidebarCharacterItem from "./SidebarCharacterItem";
import SidebarSceneItem from "./SidebarSceneItem";

import CharacterSVG from "@public/images/character.svg";
import LocationSVG from "@public/images/location.svg";

import sidebar from "./EditorSidebar.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";
import { CharacterItem } from "@src/lib/editor/characters";

enum NavigationMenu {
    Characters,
    Locations,
    Others,
}

const EditorSidebarNavigation = () => {
    const { scenesData, charactersData } = useContext(ProjectContext);
    const { isZenMode, updateContextMenu } = useContext(UserContext);
    const [menu, setMenu] = useState<NavigationMenu>(NavigationMenu.Characters);

    const isActive = isZenMode ? "" : sidebar_nav.active;

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
            typeSpecificProps: {},
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
                        Object.entries(charactersData).map((item: [string, CharacterItem]) => {
                            return <SidebarCharacterItem key={item[0]} character={{ name: item[0], ...item[1] }} />;
                        })}
                    <div className={sidebar_nav.list_fill} onContextMenu={handleDropdownCharacterList} />
                </div>
            </div>
            <div>
                <p className={sidebar_nav.list_title}>Scenes</p>
                <div className={join(sidebar_nav.list, sidebar_nav.scene_list)}>
                    {scenesData.map((scene: SceneItem) => {
                        return <SidebarSceneItem key={scene.position} scene={scene} />;
                    })}
                    <div className={sidebar_nav.list_fill} onContextMenu={handleDropdownSceneList} />
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarNavigation;
