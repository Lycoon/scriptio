import EditorTab from "../EditorTab";

import BoldSVG from "@public/images/bold.svg";
import ItalicSVG from "@public/images/italic.svg";
import UnderlineSVG from "@public/images/underline.svg";

import sidebar from "./EditorSidebar.module.css";
import { join } from "@src/lib/utils/misc";
import { ScreenplayElement, Style } from "@src/lib/utils/enums";
import { Dispatch, SetStateAction, useContext } from "react";
import { applyMarkToggle } from "@src/lib/editor/editor";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { Editor } from "@tiptap/react";

type FormatButtonsProps = {
    selectedStyles: Style;
    setActiveStyles: Dispatch<SetStateAction<Style>>;
    editor: Editor;
};

export const FormatButtons = ({ selectedStyles, setActiveStyles, editor }: FormatButtonsProps) => {
    const toggleStyle = (style: Style) => {
        setActiveStyles((prev) => prev ^ style);
        applyMarkToggle(editor, style);
    };

    const getActiveStyleCSS = (style: Style) => (selectedStyles & style ? sidebar.active_style : "");
    const boldActive = getActiveStyleCSS(Style.Bold);
    const italicActive = getActiveStyleCSS(Style.Italic);
    const underlineActive = getActiveStyleCSS(Style.Underline);

    return (
        <div className={sidebar.style_btns}>
            <div className={join(sidebar.style_btn, boldActive)} onClick={() => toggleStyle(Style.Bold)}>
                <BoldSVG className={sidebar.style_btn_img} />
            </div>
            <div className={join(sidebar.style_btn, italicActive)} onClick={() => toggleStyle(Style.Italic)}>
                <ItalicSVG className={sidebar.style_btn_img} />
            </div>
            <div className={join(sidebar.style_btn, underlineActive)} onClick={() => toggleStyle(Style.Underline)}>
                <UnderlineSVG className={sidebar.style_btn_img} />
            </div>
        </div>
    );
};

type EditorSidebarFormatProps = {
    selectedStyles: Style;
    setActiveStyles: Dispatch<SetStateAction<Style>>;
    selectedElement: ScreenplayElement;
    setActiveElement: (activeElement: ScreenplayElement) => void;
};

const EditorSidebarFormat = ({
    selectedStyles,
    setActiveStyles,
    selectedElement,
    setActiveElement,
}: EditorSidebarFormatProps) => {
    const { screenplayEditor } = useContext(ProjectContext);
    const { isZenMode } = useContext(UserContext);
    const isActive = isZenMode ? "" : sidebar.active;

    return (
        <div className={join(sidebar.container, sidebar.tabs, isActive)}>
            <div className={sidebar.tabs}>
                <FormatButtons
                    selectedStyles={selectedStyles}
                    setActiveStyles={setActiveStyles}
                    editor={screenplayEditor!}
                />
                <EditorTab
                    content="SCENE HEADING"
                    element={ScreenplayElement.Scene}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
                <EditorTab
                    content="Action"
                    element={ScreenplayElement.Action}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
                <EditorTab
                    content="CHARACTER"
                    element={ScreenplayElement.Character}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
                <EditorTab
                    content="Dialogue"
                    element={ScreenplayElement.Dialogue}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
                <EditorTab
                    content="(Parenthetical)"
                    element={ScreenplayElement.Parenthetical}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
                <EditorTab
                    content="TRANSITION:"
                    element={ScreenplayElement.Transition}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
                <EditorTab
                    content="Section"
                    element={ScreenplayElement.Section}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
                <EditorTab
                    content="[[Note]]"
                    element={ScreenplayElement.Note}
                    currentElement={selectedElement}
                    setActiveElement={setActiveElement}
                />
            </div>
        </div>
    );
};

export default EditorSidebarFormat;
