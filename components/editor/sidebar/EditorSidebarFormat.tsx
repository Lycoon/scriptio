import EditorTab from "../EditorTab";

import BoldSVG from "../../../public/images/bold.svg";
import ItalicSVG from "../../../public/images/italic.svg";
import UnderlineSVG from "../../../public/images/underline.svg";

import sidebar from "./EditorSidebar.module.css";
import { join } from "@src/lib/utils/misc";

type Props = {
    tabs: any[];
    selectedTab: number;
    setActiveTab: (activeTab: string) => void;
    toggleBold: () => void;
    toggleItalic: () => void;
    toggleUnderline: () => void;
    isBold: boolean;
    isItalic: boolean;
    isUnderline: boolean;
};

const EditorSidebarFormat = ({
    tabs,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    isBold,
    isItalic,
    isUnderline,
    selectedTab,
    setActiveTab,
}: Props) => {
    const boldActive = isBold ? sidebar.active_style : "";
    const italicActive = isItalic ? sidebar.active_style : "";
    const underlineActive = isUnderline ? sidebar.active_style : "";

    return (
        <div className={join(sidebar.container, sidebar.tabs)}>
            <div className={sidebar.tabs}>
                <div className={sidebar.style_btns}>
                    <div className={join(sidebar.style_btn, boldActive)} onClick={toggleBold}>
                        <BoldSVG className={sidebar.style_btn_img} />
                    </div>
                    <div className={join(sidebar.style_btn, italicActive)} onClick={toggleItalic}>
                        <ItalicSVG className={sidebar.style_btn_img} />
                    </div>
                    <div
                        className={join(sidebar.style_btn, underlineActive)}
                        onClick={toggleUnderline}
                    >
                        <UnderlineSVG className={sidebar.style_btn_img} />
                    </div>
                </div>
                <EditorTab
                    action={() => setActiveTab("scene")}
                    content="SCENE HEADING"
                    active={tabs[selectedTab] == "scene"}
                />
                <EditorTab
                    action={() => setActiveTab("action")}
                    content="Action"
                    active={tabs[selectedTab] == "action"}
                />
                <EditorTab
                    action={() => setActiveTab("character")}
                    content="CHARACTER"
                    active={tabs[selectedTab] == "character"}
                />
                <EditorTab
                    action={() => setActiveTab("dialogue")}
                    content="Dialogue"
                    active={tabs[selectedTab] == "dialogue"}
                />
                <EditorTab
                    action={() => setActiveTab("parenthetical")}
                    content="(Parenthetical)"
                    active={tabs[selectedTab] == "parenthetical"}
                />
                <EditorTab
                    action={() => setActiveTab("transition")}
                    content="TRANSITION:"
                    active={tabs[selectedTab] == "transition"}
                />
                <EditorTab
                    action={() => setActiveTab("section")}
                    content="Section"
                    active={tabs[selectedTab] == "section"}
                />
                <EditorTab
                    action={() => setActiveTab("note")}
                    content="[[Note]]"
                    active={tabs[selectedTab] == "note"}
                />
            </div>
        </div>
    );
};

export default EditorSidebarFormat;
