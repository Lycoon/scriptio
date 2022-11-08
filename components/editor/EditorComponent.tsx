import { EditorContent, Editor } from "@tiptap/react";
import { useEffect } from "react";
import PageCounter from "./PageCounter";

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
