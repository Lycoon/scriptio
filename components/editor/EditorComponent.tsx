import { EditorContent, Editor } from "@tiptap/react";
import { useEffect, useState } from "react";

type Props = {
    editor: Editor | null;
};

const EditorComponent = ({ editor }: Props) => {
    const [pages, setPages] = useState<number>(0);

    useEffect(() => {
        const target = document.getElementById("editor")!;
        const callback = (entries: ResizeObserverEntry[]) => {
            const height = entries[0].contentRect.height;
            const nbPages = +((height || 0) / 860).toFixed(0);
            setPages(nbPages);
        };
        const observer = new ResizeObserver(callback);
        observer.observe(target);
    }, []);

    return (
        <div id="editor">
            <div className="page-counter">
                {Array.from({ length: pages }, (_, page) => (
                    <p key={page} className="page-nb unselectable">
                        p.{page + 1}
                    </p>
                ))}
            </div>
            <EditorContent editor={editor} />
        </div>
    );
};

export default EditorComponent;
