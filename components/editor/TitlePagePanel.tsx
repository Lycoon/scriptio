"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

import { ProjectContext } from "@src/context/ProjectContext";
import { titlePageMetadataRef } from "@src/lib/titlepage/metadata-ref";
import { DEFAULT_TITLEPAGE_CONTENT } from "@src/lib/titlepage/editor";
import { TitlePageElement } from "@src/lib/utils/enums";

import { TITLEPAGE_EDITOR_CONFIG } from "@src/lib/editor/document-editor-config";
import DocumentEditorPanel from "./DocumentEditorPanel";

const TitlePagePanel = ({ isVisible }: { isVisible?: boolean }) => {
    const projectCtx = useContext(ProjectContext);
    const { updateTitlePageEditor, isYjsReady, repository, projectTitle, projectAuthor } = projectCtx;

    const [titleEditor, setTitleEditor] = useState<Editor | null>(null);

    // Keep the module-level ref in sync so format node views always get the latest values
    titlePageMetadataRef.projectTitle = projectTitle || "";
    titlePageMetadataRef.projectAuthor = projectAuthor || "";

    // Synchronous storage update for nodes rendered before effects run
    if (titleEditor && typeof titleEditor.storage === "object") {
        const storage = (titleEditor.storage as any).titlePageMetadata;
        if (storage) {
            storage.projectTitle = projectTitle || "";
            storage.projectAuthor = projectAuthor || "";
        }
    }

    const handleEditorCreated = useCallback(
        (editor: Editor | null) => {
            updateTitlePageEditor(editor);
            setTitleEditor(editor);
        },
        [updateTitlePageEditor],
    );

    // Initialize default template if title page is empty
    useEffect(() => {
        if (!titleEditor || !isYjsReady || !repository || !titleEditor.view) return;

        const state = repository.getState();
        const meta = state.metadata();

        if (!meta.get("titlepageInitialized")) {
            titleEditor.commands.setContent(DEFAULT_TITLEPAGE_CONTENT);

            const { state: editorState, view } = titleEditor;
            const tr = editorState.tr;
            let modified = false;

            tr.doc.descendants((node, pos) => {
                if (node.type.name === TitlePageElement.Title) {
                    const markType = editorState.schema.marks.underline;
                    if (markType) {
                        tr.addMark(pos, pos + node.nodeSize, markType.create({ class: "underline" }));
                        modified = true;
                    }
                    return false;
                }
            });

            if (modified && view) {
                view.dispatch(tr);
            }

            meta.set("titlepageInitialized", true);
        }
    }, [titleEditor, isYjsReady, repository]);

    // Sync project metadata into editor storage for node view rendering
    useEffect(() => {
        if (!titleEditor || titleEditor.isDestroyed) return;
        const storage = (titleEditor.storage as any).titlePageMetadata;
        if (storage) {
            storage.projectTitle = projectTitle || "";
            storage.projectAuthor = projectAuthor || "";
            storage.nodeViewUpdaters?.forEach((fn: () => void) => fn());
            if (titleEditor.view && !titleEditor.view.isDestroyed) {
                titleEditor.view.dispatch(titleEditor.state.tr.setMeta("titlePageMetadataUpdate", true));
            }
        }
    }, [titleEditor, projectTitle, projectAuthor]);

    return (
        <DocumentEditorPanel
            config={TITLEPAGE_EDITOR_CONFIG}
            isVisible={isVisible ?? true}
            onEditorCreated={handleEditorCreated}
        />
    );
};

export default TitlePagePanel;

