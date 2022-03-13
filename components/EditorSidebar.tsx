import { useCallback, useEffect } from "react";
import { useEditorState } from "../context/AppContext";
import EditorTab from "./EditorTab";

type TabDictionary = { [name: string]: HTMLElement | null };
const EditorSidebar = () => {
  const { editor, updateEditor } = useEditorState();
  const getSelectedNode = () => {};

  let selectedTab = 0;
  let nodes: string[] = [];
  const tabs: TabDictionary = {};
  const setActiveTab = (node: string) => {
    selectedTab = nodes.indexOf(node);
    editor?.chain().focus().toggleNode(node, node, {}).run();
  };

  const tabKeyPressed = useCallback((event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      selectedTab = ++selectedTab % 6;
      setActiveTab(nodes[selectedTab]);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", tabKeyPressed, false);

    tabs["SceneHeading"] = document.getElementById("scene");
    tabs["Action"] = document.getElementById("action");
    tabs["Character"] = document.getElementById("character");
    tabs["Dialogue"] = document.getElementById("dialogue");
    tabs["Parenthetical"] = document.getElementById("parenthetical");
    tabs["Transition"] = document.getElementById("transition");
    nodes = Object.keys(tabs);

    return () => {
      document.removeEventListener("keydown", tabKeyPressed, false);
    };
  }, []);

  const setSceneHeading = () => {
    setActiveTab("SceneHeading");
  };

  const setAction = () => {
    setActiveTab("Action");
  };

  const setCharacter = () => {
    setActiveTab("Character");
  };

  const setDialogue = () => {
    setActiveTab("Dialogue");
  };

  const setParenthetical = () => {
    setActiveTab("Parenthetical");
  };

  const setTransition = () => {
    setActiveTab("Transition");
  };

  return (
    <div id="sidebar" className="sidebar-shadow tabs">
      <EditorTab id_="scene" action={setSceneHeading} content="SCENE HEADING" />
      <EditorTab id_="action" action={setAction} content="Action" />
      <EditorTab id_="character" action={setCharacter} content="CHARACTER" />
      <EditorTab id_="dialogue" action={setDialogue} content="Dialogue" />
      <EditorTab id_="parenthetical" action={setParenthetical} content="(Parenthetical)" />
      <EditorTab id_="transition" action={setTransition} content="TRANSITION:" />
    </div>
  );
};

export default EditorSidebar;
