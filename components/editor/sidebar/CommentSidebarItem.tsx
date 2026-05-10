"use client";

import { memo, useCallback, useContext } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { Comment } from "@src/lib/utils/types";
import { getCommentPositions } from "@src/lib/screenplay/extensions/comment-highlight-extension";
import { focusOnPosition } from "@src/lib/screenplay/editor";
import { join } from "@src/lib/utils/misc";
import nav_item from "./SidebarItem.module.css";

type CommentSidebarItemProps = {
    comment: Comment;
    isActive: boolean;
    onActivate: () => void;
};

const CommentSidebarItem = memo(({ comment, isActive, onActivate }: CommentSidebarItemProps) => {
    const { editor } = useContext(ProjectContext);

    const handleDoubleClick = useCallback(() => {
        if (!editor) return;
        const positions = getCommentPositions(editor);
        const pos = positions.get(comment.id);
        if (pos) {
            focusOnPosition(editor, pos.from);
        }
    }, [comment.id, editor]);

    const handleClick = useCallback(() => {
        onActivate();
    }, [onActivate]);

    // Format date similar to other places, keeping it short
    const date = new Date(comment.createdAt);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    const containerClass = join(
        nav_item.container,
        isActive ? nav_item.current : "",
    );

    return (
        <div
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            className={containerClass}
            style={{ cursor: "pointer" }}
        >
            <div className={nav_item.header}>
                <div className={nav_item.title_row}>
                    <p className={join(nav_item.title, "unselectable")} style={{ fontWeight: 600 }}>{comment.author}</p>
                </div>
                <span className={nav_item.sceneLength}>{dateStr}</span>
            </div>
            <p className={join(nav_item.preview, "unselectable")}>{comment.text || "Empty comment"}</p>
        </div>
    );
});

CommentSidebarItem.displayName = "CommentSidebarItem";

export default CommentSidebarItem;
