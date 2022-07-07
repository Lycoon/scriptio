import EditorTab from "./EditorTab";

type Props = {
    tabs: any[];
    selectedTab: number;
    setActiveTab: (activeTab: string) => void;
    toggleBold: () => void;
    toggleItalic: () => void;
    toggleUnderline: () => void;
    isSaving: boolean;
};

const EditorSidebar = ({
    tabs,
    toggleBold,
    toggleItalic,
    toggleUnderline,
    selectedTab,
    setActiveTab,
    isSaving,
}: Props) => {
    return (
        <div id="sidebar" className="sidebar-shadow tabs">
            <div className="tabs">
                <div className="editor-style-buttons">
                    <div className="editor-style-btn" onClick={toggleBold}>
                        <img
                            className="editor-style-icon"
                            src="/images/bold.png"
                        />
                    </div>
                    <div className="editor-style-btn" onClick={toggleItalic}>
                        <img
                            className="editor-style-icon"
                            src="/images/italic.png"
                        />
                    </div>
                    <div className="editor-style-btn" onClick={toggleUnderline}>
                        <img
                            className="editor-style-icon"
                            src="/images/underline.png"
                        />
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
            </div>
            <p
                className={`saving-info saving-info-${
                    isSaving ? "visible" : "hidden"
                }`}
            >
                Saving...
            </p>
        </div>
    );
};

export default EditorSidebar;
