import { useCallback, useEffect, useState } from "react";
import { useEditorState } from "../context/AppContext";
import EditorTab from "./EditorTab";

type TabElementType = HTMLElement | null;
type TabDictionary = { [name: string]: TabElementType };

const EditorSidebar = () => {
  const { editor, updateEditor } = useEditorState();
  const getSelectedNode = () => {};

  const [selectedTab, updateSelectedTab] = useState<number>(0);
  const tabs = [
    "SceneHeading",
    "Action",
    "Character",
    "Dialogue",
    "Parenthetical",
    "Transition",
  ];

  const setActiveTab = (node: string) => {
    updateSelectedTab(tabs.indexOf(node));
    editor?.chain().focus().toggleNode(node, node, {}).run();
  };

  const tabKeyPressed = (event: any) => {
    if (event.key === "Tab") {
      event.preventDefault();

      const idx = (selectedTab + 1) % 6;
      updateSelectedTab(idx);
      setActiveTab(tabs[idx]);
    }
  };

  useEffect(() => {
    setActiveTab("SceneHeading");
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", tabKeyPressed, false);

    return () => {
      document.removeEventListener("keydown", tabKeyPressed, false);
    };
  }, [selectedTab]);

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
