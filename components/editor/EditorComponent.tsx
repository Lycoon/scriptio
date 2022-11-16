import { EditorContent, Editor } from "@tiptap/react";
import { useEffect } from "react";
import PageCounter from "./PageCounter";

type Props = {
    editor: Editor | null;
};

const EditorComponent = ({ editor }: Props) => {
    return (
        <div id="editor">
            <EditorContent editor={editor} />
        </div>
    );
};

export default EditorComponent;
