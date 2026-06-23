"use client";

import { useContext, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { SCREENPLAY_EDITOR_CONFIG } from "@src/lib/editor/document-editor-config";
import { useDocumentComments } from "@src/lib/editor/use-document-comments";
import { join } from "@src/lib/utils/misc";
import { MessageSquare } from "lucide-react";
import CommentSidebarItem from "./CommentSidebarItem";

import form from "./../../utils/Form.module.css";
import sidebar_nav from "./EditorSidebarNavigation.module.css";

const CommentSidebarView = () => {
    const t = useTranslations("editorSidebar");
    const { repository } = useContext(ProjectContext);

    const projectState = repository?.getState();
    const commentsMap = useMemo(
        () =>
            projectState && SCREENPLAY_EDITOR_CONFIG.features.comments
                ? SCREENPLAY_EDITOR_CONFIG.getCommentsMap(projectState)
                : null,
        [projectState],
    );

    const { comments, activeNodeId, setActiveNodeId } = useDocumentComments(commentsMap, repository);

    const unresolvedComments = useMemo(() => comments.filter((c) => !c.resolved), [comments]);

    return (
        <>
            <div className={sidebar_nav.list_header}>
                <MessageSquare size={18} />
                <p className={form.label}>{t("comments")}</p>
            </div>
            <div className={join(sidebar_nav.list, sidebar_nav.scene_list)}>
                {unresolvedComments.length !== 0 ? (
                    unresolvedComments.map((comment) => (
                        <CommentSidebarItem
                            key={comment.id}
                            comment={comment}
                            isActive={activeNodeId === comment.nodeId}
                            onActivate={() => setActiveNodeId(comment.nodeId)}
                        />
                    ))
                ) : (
                    <div className={sidebar_nav.empty_state}>
                        {t("commentsEmpty")}
                    </div>
                )}
            </div>
        </>
    );
};

export default CommentSidebarView;
