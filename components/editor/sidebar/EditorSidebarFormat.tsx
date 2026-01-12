"use client";

import { join } from "@src/lib/utils/misc";
import { useContext } from "react";
import { UserContext } from "@src/context/UserContext";

import form from "./../../utils/Form.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";
import sidebar from "./EditorSidebar.module.css";
import { MapPinned, UserRound } from "lucide-react";
import { ProjectContext } from "@src/context/ProjectContext";
import SidebarCharacterItem from "./SidebarCharacterItem";
import SidebarLocationItem from "./SidebarLocationItem";
import { CharacterItem } from "@src/lib/screenplay/characters";
import { LocationItem } from "@src/lib/screenplay/locations";

const EditorSidebarFormat = () => {
    const { charactersData, locationsData } = useContext(ProjectContext);
    const { isZenMode } = useContext(UserContext);
    const isActive = isZenMode ? "" : sidebar.active;
    const characters = Object.keys(charactersData).length;
    const locations = Object.keys(locationsData).length;

    return (
        <div className={join(sidebar.container, isActive)}>
            <div className={sidebar_nav.element}>
                <div className={sidebar_nav.list_header}>
                    <UserRound size={18} />
                    <p className={form.label}>Characters</p>
                </div>
                <div className={sidebar_nav.list}>
                    {characters != 0 &&
                        Object.entries(charactersData).map((item: [string, CharacterItem]) => {
                            return <SidebarCharacterItem key={item[0]} character={{ name: item[0], ...item[1] }} />;
                        })}
                </div>
            </div>
            <div className={sidebar_nav.element}>
                <div className={sidebar_nav.list_header}>
                    <MapPinned size={18} />
                    <p className={form.label}>Locations</p>
                </div>
                <div className={sidebar_nav.list}>
                    {locations != 0 &&
                        Object.entries(locationsData).map((item: [string, LocationItem]) => {
                            return <SidebarLocationItem key={item[0]} location={{ name: item[0], ...item[1] }} />;
                        })}
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarFormat;
