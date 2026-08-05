"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";

import { ProjectContext } from "@src/context/ProjectContext";
import { titlePageMetadataRef } from "@src/lib/titlepage/metadata-ref";
import { seedTitlePage } from "@src/lib/titlepage/titlepage-seed";

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
    const { updateTitlePageEditor, isYjsSynced, repository, projectTitle, projectAuthor } = projectCtx;

    const [titleEditor, setTitleEditor] = useState<Editor | null>(null);

    const handleEditorCreated = useCallback(
        (editor: Editor | null) => {
            updateTitlePageEditor(editor);
            setTitleEditor(editor);
        },
        [updateTitlePageEditor],
    );

    // Seed the default template into a title page that has never had one.
    //
    // Waits for `isYjsSynced`, not `isYjsReady`: readiness only means the local
    // cache has loaded, so a fresh device would otherwise decide "this project
    // has no title page" while the real one is still in flight and end up with
    // both. `seedTitlePage` writes to the doc directly (no editor needed) and is
    // idempotent under merge, so a concurrent seed on another client — or one
    // from a device that was offline at this point — still converges to a single
    // copy. `titlepageInitialized` keeps a deliberately emptied title page empty.
    useEffect(() => {
        if (!isYjsSynced || !repository || repository.readOnly) return;

        const state = repository.getState();
        const meta = state.metadata();
        if (meta.get("titlepageInitialized")) return;

        seedTitlePage(state);
        meta.set("titlepageInitialized", true);
    }, [isYjsSynced, repository]);

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
