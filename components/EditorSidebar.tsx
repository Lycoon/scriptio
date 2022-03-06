import { useEditorState } from "../context/AppContext";
import EditorTab from "./EditorTab";

const EditorSidebar = () => {
  const { editor, updateEditor } = useEditorState();
  const updateNode = (node: string) => {
    console.log("Switched to node: " + node);
    editor?.chain().focus().toggleNode(node, node, {}).run();
  };
  const getSelectedNode = () => {};

  const setSceneHeading = () => {
    updateNode("SceneHeading");
  };

  const setAction = () => {
    updateNode("Action");
  };

  const setCharacter = () => {
    updateNode("Character");
  };

  const setDialogue = () => {
    updateNode("Dialogue");
  };

  const setParenthetical = () => {
    updateNode("Parenthetical");
  };

  const setTransition = () => {
    console.log(getSelectedNode());
    console.log(editor?.isActive("Dialogue"));
  };

  return (
    <div id="sidebar" className="sidebar-shadow tabs">
      <EditorTab action={setSceneHeading} content="SCENE HEADING" />
      <EditorTab action={setAction} content="Action" />
      <EditorTab action={setCharacter} content="CHARACTER" />
      <EditorTab action={setDialogue} content="Dialogue" />
      <EditorTab action={setParenthetical} content="(Parenthetical)" />
      <EditorTab action={setTransition} content="TRANSITION:" />
    </div>
  );
};

export default EditorSidebar;
