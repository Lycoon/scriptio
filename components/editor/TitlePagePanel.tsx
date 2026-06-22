"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";

import { ProjectContext } from "@src/context/ProjectContext";
import { titlePageMetadataRef } from "@src/lib/titlepage/metadata-ref";
import { DEFAULT_TITLEPAGE_CONTENT } from "@src/lib/titlepage/editor";
import { TitlePageElement } from "@src/lib/utils/enums";

import { TITLEPAGE_EDITOR_CONFIG } from "@src/lib/editor/document-editor-config";
import DocumentEditorPanel from "./DocumentEditorPanel";

interface TitlePageStorage {
    projectTitle: string;
    projectAuthor: string;
    nodeViewUpdaters?: Array<() => void>;
}

type EditorStorage = { titlePageMetadata?: TitlePageStorage };

const TitlePagePanel = ({ isVisible }: { isVisible?: boolean }) => {
    const projectCtx = useContext(ProjectContext);
    const { updateTitlePageEditor, isYjsReady, repository, projectTitle, projectAuthor } = projectCtx;

    const [titleEditor, setTitleEditor] = useState<Editor | null>(null);

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

        // Seed the default template only into a genuinely empty title page. Guard
        // on the Yjs fragment being empty — not on the metadata flag alone — so a
        // fresh editor mount, a not-yet-synced flag, or an imported title page
        // never gets overwritten or has the template appended more than once.
        if (meta.get("titlepageInitialized") || state.titlepageFragment().length > 0) {
            if (!meta.get("titlepageInitialized")) meta.set("titlepageInitialized", true);
            return;
        }

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
    }, [titleEditor, isYjsReady, repository]);

    // Sync project metadata into the module-level ref and editor storage for node view rendering
    useEffect(() => {
        titlePageMetadataRef.projectTitle = projectTitle || "";
        titlePageMetadataRef.projectAuthor = projectAuthor || "";

        if (!titleEditor || titleEditor.isDestroyed) return;
        const storage = (titleEditor.storage as EditorStorage).titlePageMetadata;
        if (storage) {
            // eslint-disable-next-line react-hooks/immutability
            storage.projectTitle = projectTitle || "";
            storage.projectAuthor = projectAuthor || "";
            storage.nodeViewUpdaters?.forEach((fn) => fn());
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
