import { EditorContent, Editor } from "@tiptap/react";

type Props = {
  editor: Editor | undefined;
};

const EditorComponent = ({ editor }: any) => {
  return (
    <div id="editor">
      <EditorContent editor={editor} />
    </div>
  );
};

export default EditorComponent;
