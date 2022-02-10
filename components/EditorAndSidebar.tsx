import EditorComponent from "./EditorComponent";
import EditorSidebar from "./EditorSidebar";

const EditorAndSidebar = () => {
  return (
    <div id="editor-and-sidebar">
      <div id="editor-container">
        <EditorComponent />
      </div>
      <EditorSidebar />
    </div>
  );
};

export default EditorAndSidebar;
