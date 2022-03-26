import { useEffect, useState } from "react";
import { useEditorState } from "../../context/AppContext";
import EditorComponent from "./EditorComponent";
import EditorSidebar from "./EditorSidebar";

const EditorAndSidebar = () => {
  const { editor, updateEditor } = useEditorState();
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

  const tabKeyPressed = (event: any) => {
    if (event.key === "Tab") {
      event.preventDefault();

      const idx = (selectedTab + 1) % 6;
      updateSelectedTab(idx);
      setActiveTab(tabs[idx]);
    }
  };

  useEffect(() => {
    setActiveTab("action");
  }, [editor]);

  useEffect(() => {
    document.addEventListener("keydown", tabKeyPressed, false);

    return () => {
      document.removeEventListener("keydown", tabKeyPressed, false);
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
