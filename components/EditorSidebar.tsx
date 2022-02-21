import { useEditorState } from "../context/AppContext";
import EditorTab from "./EditorTab";

const EditorSidebar = () => {
  const { editor, updateEditor } = useEditorState();

  const setSceneHeading = () => {
    console.log("setSceneHeading");

    if (editor !== null) {
      console.log(editor.getHTML());
    }
  };

  const setAction = () => {
    console.log("setAction");
  };

  const setCharacter = () => {
    console.log("setCharacter");
  };

  const setDialogue = () => {
    console.log("setDialogue");
  };

  const setParenthetical = () => {
    console.log("setParenthetical");
  };

  const setTransition = () => {
    console.log("setTransition");
  };

  const setActStart = () => {
    console.log("setActStart");
  };

  const setActEnd = () => {
    console.log("setActEnd");
  };

  const setNote = () => {
    console.log("setNote");
  };

  return (
    <div id="sidebar" className="sidebar-shadow tabs">
      <EditorTab action={setSceneHeading} content="SCENE HEADING" />
      <EditorTab action={setAction} content="Action" />
      <EditorTab action={setCharacter} content="CHARACTER" />
      <EditorTab action={setDialogue} content="Dialogue" />
      <EditorTab action={setParenthetical} content="(Parenthetical)" />
      <EditorTab action={setTransition} content="TRANSITION:" />
      <EditorTab action={setActStart} content="ACT START" />
      <EditorTab action={setActEnd} content="ACT END" />
      <EditorTab action={setNote} content="[[Note]]" />
    </div>
  );
};

export default EditorSidebar;
