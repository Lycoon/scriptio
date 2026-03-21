"use client";

import { join } from "@src/lib/utils/misc";
import { useContext } from "react";
import { useTranslations } from "next-intl";
import { useViewContext } from "@src/context/ViewContext";

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
    const t = useTranslations("editorSidebar");
    const { characters: charactersData, locations: locationsData, highlightedCharacters } = useContext(ProjectContext);
    const { rightSidebarOpen } = useViewContext();
    const characters = Object.keys(charactersData || {}).length;
    const locations = Object.keys(locationsData || {}).length;

    return (
        <div className={sidebar.container}>
            <div className={join(sidebar.sidebar_content, !rightSidebarOpen ? sidebar.collapsed : "")}>
                <div className={sidebar_nav.element}>
                    <div className={sidebar_nav.list_header}>
                        <UserRound size={18} />
                        <p className={form.label}>{t("characters")}</p>
                    </div>
                    <div className={sidebar_nav.list}>
                        {characters != 0 &&
                            charactersData &&
                            Object.entries(charactersData).map((item: [string, CharacterItem]) => {
                                const isHighlighted = highlightedCharacters.has(item[0].toUpperCase());
                                return <SidebarCharacterItem key={item[0]} character={{ name: item[0], ...item[1] }} isHighlighted={isHighlighted} />;
                            })}
                    </div>
                </div>
                <div className={sidebar_nav.element}>
                    <div className={sidebar_nav.list_header}>
                        <MapPinned size={18} />
                        <p className={form.label}>{t("locations")}</p>
                    </div>
                    <div className={sidebar_nav.list}>
                        {locations != 0 &&
                            locationsData &&
                            Object.entries(locationsData).map((item: [string, LocationItem]) => {
                                return <SidebarLocationItem key={item[0]} location={{ name: item[0], ...item[1] }} />;
                            })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarFormat;
