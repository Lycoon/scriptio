import { join } from "@src/lib/utils/misc";
import { useContext, useState } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { SceneItem } from "@src/lib/editor/screenplay";
import { CharacterItem } from "@src/lib/editor/characters";
import SidebarCharacterItem from "./SidebarCharacterItem";
import SidebarSceneItem from "./SidebarSceneItem";

import CharacterSVG from "@public/images/profile.svg";
import LocationSVG from "@public/images/location.svg";
import MovieSVG from "@public/images/movie.svg";

import form from "./../../utils/Form.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";

enum NavigationMenu {
    Characters,
    Locations,
    Others,
}

const EditorSidebarNavigation = () => {
    const { scenesData, charactersData } = useContext(ProjectContext);
    const { isZenMode } = useContext(UserContext);

    const isActive = isZenMode ? "" : sidebar_nav.active;

    return (
        <div className={join(sidebar_nav.container, isActive)}>
            <div className={sidebar_nav.element}>
                <div className={sidebar_nav.list_header}>
                    <MovieSVG className={sidebar_nav.header_icon} />
                    <p className={form.label}>Scenes</p>
                </div>
                <div className={join(sidebar_nav.list, sidebar_nav.scene_list)}>
                    {scenesData.map((scene: SceneItem) => {
                        return <SidebarSceneItem key={scene.position} scene={scene} />;
                    })}
                </div>
            </div>
            <div className={sidebar_nav.element}>
                <div className={sidebar_nav.list_header}>
                    <CharacterSVG className={sidebar_nav.header_icon} />
                    <p className={form.label}>Characters</p>
                </div>
                <div className={sidebar_nav.list}>
                    {Object.entries(charactersData).map((item: [string, CharacterItem]) => {
                        return <SidebarCharacterItem key={item[0]} character={{ name: item[0], ...item[1] }} />;
                    })}
                </div>
            </div>
            <div className={sidebar_nav.element}>
                <div className={sidebar_nav.list_header}>
                    <LocationSVG className={sidebar_nav.header_icon} />
                    <p className={form.label}>Locations</p>
                </div>
                <div className={sidebar_nav.list}>
                    {Object.entries(charactersData).map((item: [string, CharacterItem]) => {
                        return <SidebarCharacterItem key={item[0]} character={{ name: item[0], ...item[1] }} />;
                    })}
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarNavigation;
