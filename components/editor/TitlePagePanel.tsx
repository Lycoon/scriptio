"use client";

import { useContext, useEffect, useState } from "react";
import { useTitlePageEditor } from "@src/lib/titlepage/editor";
import { ProjectContext } from "@src/context/ProjectContext";
import { EditorContent } from "@tiptap/react";
import Loading from "@components/utils/Loading";
import { useProjectMembership } from "@src/lib/utils/hooks";
import { isTauri } from "@tauri-apps/api/core";

import styles from "./TitlePagePanel.module.css";

const TitlePagePanel = ({ isVisible }: { isVisible?: boolean }) => {
    const { membership, isLoading } = useProjectMembership();
    const { isYjsReady, setFocusedEditorType } = useContext(ProjectContext);
    const [isEditorReady, setIsEditorReady] = useState(false);

    const editor = useTitlePageEditor();

    useEffect(() => {
        if (editor && isYjsReady) {
            const timer = setTimeout(() => setIsEditorReady(true), 500);
            return () => clearTimeout(timer);
        }
    }, [editor, isYjsReady]);

    const isDesktop = isTauri();
    if (!isDesktop && (!membership || isLoading)) return <Loading />;

    return (
        <div
            className={`${styles.title_page_panel} ${isEditorReady ? styles.visible : styles.hidden}`}
        >
            <div className={styles.container} onFocus={() => setFocusedEditorType("title")}>
                <div className={styles.editor_wrapper}>
                    <EditorContent editor={editor} spellCheck={false} />
                </div>
            </div>
        </div>
    );
};

export default TitlePagePanel;
