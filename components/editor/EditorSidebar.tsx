import EditorTab from "./EditorTab";

type Props = {
    tabs: any[];
    selectedTab: number;
    setActiveTab: (activeTab: string) => void;
    isSaving: boolean;
};

const EditorSidebar = ({
    tabs,
    selectedTab,
    setActiveTab,
    isSaving,
}: Props) => {
    return (
        <div id="sidebar" className="sidebar-shadow tabs">
            <div className="tabs">
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
