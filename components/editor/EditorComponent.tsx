import { EditorContent, Editor } from "@tiptap/react";
import { useEffect, useState } from "react";

type Props = {
    editor: Editor | null;
};

const EditorComponent = ({ editor }: Props) => {
    const [pages, setPages] = useState<number>(0);

    useEffect(() => {
        setTimeout(() => {
            const div = document.getElementById("editor");
            const height = +((div?.clientHeight || 0) / 860).toFixed(0);
            setPages(height);
        }, 1000); // waiting for the editor to render otherwise the height is wrong
    }, []);

    return (
        <div id="editor">
            <span className="page-counter">
                {Array.from({ length: pages }, (_, page) => (
                    <p key={page} className="page-nb unselectable">
                        p.{page + 1}
                    </p>
                ))}
            </span>
            <EditorContent editor={editor} />
        </div>
    );
};

export default EditorComponent;
