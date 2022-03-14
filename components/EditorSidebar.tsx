import { useCallback, useEffect, useState } from "react";
import { useEditorState } from "../context/AppContext";
import EditorTab from "./EditorTab";

type TabElementType = HTMLElement | null;
type TabDictionary = { [name: string]: TabElementType };

const EditorSidebar = () => {
  const { editor, updateEditor } = useEditorState();
  const getSelectedNode = () => {};

  const [tabs, setTabs] = useState<TabDictionary>({});
  const [selectedTab, updateSelectedTab] = useState<number>(0);
  let [nodes, setNodes] = useState<string[]>([]);
  let [buttons, setButtons] = useState<TabElementType[]>([]);

  const setActiveTab = (node: string) => {
    updateSelectedTab(nodes.indexOf(node));
    updateTabCSS(selectedTab);
    console.log(nodes.indexOf(node));

    editor?.chain().focus().toggleNode(node, node, {}).run();
  };

  const updateTabCSS = (tabIndex: number) => {
    for (let i = 0; i < buttons.length; i++) {
      if (i === tabIndex) {
        buttons[i]!.classList.add("active-tab");
      } else {
        buttons[i]!.classList.remove("active-tab");
      }
    }
  };

  const tabKeyPressed = (event: any) => {
    if (event.key === "Tab") {
      event.preventDefault();

      updateSelectedTab((selectedTab + 1) % 6);
      setActiveTab(nodes[selectedTab]);
    }
  };

  useEffect(() => {
    document.addEventListener("keydown", tabKeyPressed, false);

    tabs["SceneHeading"] = document.getElementById("scene");
    tabs["Action"] = document.getElementById("action");
    tabs["Character"] = document.getElementById("character");
    tabs["Dialogue"] = document.getElementById("dialogue");
    tabs["Parenthetical"] = document.getElementById("parenthetical");
    tabs["Transition"] = document.getElementById("transition");

    nodes = Object.keys(tabs);
    buttons = Object.values(tabs);

    setNodes(nodes);
    setButtons(buttons);

    setActiveTab("SceneHeading");

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
      <EditorTab
        id_="parenthetical"
        action={setParenthetical}
        content="(Parenthetical)"
      />
      <EditorTab
        id_="transition"
        action={setTransition}
        content="TRANSITION:"
      />
    </div>
  );
};

export default EditorSidebar;
