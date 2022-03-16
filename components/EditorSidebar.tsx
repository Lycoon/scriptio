import EditorTab from "./EditorTab";

type TabElementType = HTMLElement | null;
type TabDictionary = { [name: string]: TabElementType };

const EditorSidebar = (props: any) => {
  const tabs = props.tabs;
  const selectedTab = props.selectedTab;
  const setActiveTab = props.setActiveTab;

  return (
    <div id="sidebar" className="sidebar-shadow tabs">
      <EditorTab
        action={() => setActiveTab("SceneHeading")}
        content="SCENE HEADING"
        active={tabs[selectedTab] == "SceneHeading"}
      />
      <EditorTab
        action={() => setActiveTab("Action")}
        content="Action"
        active={tabs[selectedTab] == "Action"}
      />
      <EditorTab
        action={() => setActiveTab("Character")}
        content="CHARACTER"
        active={tabs[selectedTab] == "Character"}
      />
      <EditorTab
        action={() => setActiveTab("Dialogue")}
        content="Dialogue"
        active={tabs[selectedTab] == "Dialogue"}
      />
      <EditorTab
        action={() => setActiveTab("Parenthetical")}
        content="(Parenthetical)"
        active={tabs[selectedTab] == "Parenthetical"}
      />
      <EditorTab
        action={() => setActiveTab("Transition")}
        content="TRANSITION:"
        active={tabs[selectedTab] == "Transition"}
      />
    </div>
  );
};

export default EditorSidebar;
