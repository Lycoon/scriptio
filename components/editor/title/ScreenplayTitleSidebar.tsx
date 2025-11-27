import { ProjectContext } from "@src/context/ProjectContext";
import { Style, TitlePageElement } from "@src/lib/utils/enums";
import { Dispatch, SetStateAction, useContext } from "react";
import { FormatButtons } from "../sidebar/EditorSidebarFormat";
import { join } from "@src/lib/utils/misc";

import sidebar from "../sidebar/EditorSidebar.module.css";
import EditorTab from "../EditorTab";

type TitleSidebarFormatProps = {
    selectedStyles: Style;
    setActiveStyles: Dispatch<SetStateAction<Style>>;
    selectedElement: TitlePageElement;
    setActiveElement: (activeElement: TitlePageElement) => void;
};

const ScreenplayTitleSidebar = ({
    selectedStyles,
    setActiveStyles,
    selectedElement,
    setActiveElement,
}: TitleSidebarFormatProps) => {
    const { titleEditor } = useContext(ProjectContext);

    return (
        <div className={join(sidebar.container, sidebar.tabs, sidebar.active)}>
            <div className={sidebar.tabs}>
                <FormatButtons
                    selectedStyles={selectedStyles}
                    setActiveStyles={setActiveStyles}
                    editor={titleEditor!}
                />
                <EditorTab
                    content="Title"
                    element={TitlePageElement.Title}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
                <EditorTab
                    content="Author"
                    element={TitlePageElement.Author}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
                <EditorTab
                    content="Contact"
                    element={TitlePageElement.Contact}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
                <EditorTab
                    content="Other"
                    element={TitlePageElement.Other}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
            </div>
        </div>
    );
};

export default ScreenplayTitleSidebar;
