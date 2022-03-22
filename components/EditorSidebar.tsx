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
  );
};

export default EditorSidebar;
