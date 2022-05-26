import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../src/context/UserContext";
import EditorComponent from "./EditorComponent";
import EditorSidebar from "./EditorSidebar";

const EditorAndSidebar = () => {
  const { editor, updateEditor } = useContext(UserContext);
  const [selectedTab, updateSelectedTab] = useState<number>(0);
  const tabs = [
    "scene",
    "action",
    "character",
    "dialogue",
    "parenthetical",
    "transition",
  ];

  const setActiveTab = (node: string) => {
    updateSelectedTab(tabs.indexOf(node));
    editor?.chain().focus().setNode("Screenplay", { class: node }).run();
  };

  const tabKeyPressed = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();

      const idx = (selectedTab + 1) % 6;
      updateSelectedTab(idx);
      setActiveTab(tabs[idx]);
    }
  };

  const saveKeyPressed = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      console.log("saving screenplay");
    }
  };

  useEffect(() => {
    setActiveTab("action");
  }, [editor]);

  useEffect(() => {
    addEventListener("keydown", tabKeyPressed, false);
    addEventListener("keydown", saveKeyPressed, false);
    return () => {
      removeEventListener("keydown", tabKeyPressed, false);
      removeEventListener("keydown", saveKeyPressed, false);
    };
  });

  return (
    <div id="editor-and-sidebar">
      <div id="editor-container">
        <EditorComponent setActiveTab={setActiveTab} />
      </div>
      <EditorSidebar
        tabs={tabs}
        selectedTab={selectedTab}
        setActiveTab={setActiveTab}
      />
    </div>
  );
};

export default EditorAndSidebar;
