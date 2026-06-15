"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import { Transaction } from "@tiptap/pm/state";
import { MessageSquare, Plus, X } from "lucide-react";
import { Comment } from "@src/lib/utils/types";
import { getNodePositions } from "@src/lib/screenplay/comment-anchors";
import { useUser } from "@src/lib/utils/hooks";
import { useViewContext } from "@src/context/ViewContext";
import CommentCard from "./CommentCard";
import styles from "./CommentGutter.module.css";

const ICON_SIZE = 22;
const GUTTER_INSET = 20; // px from the page's left edge
const POPOVER_WIDTH = 320;
const POPOVER_GAP = 10;

type IconPos = { nodeId: string; top: number; left: number; count: number };

export interface CommentGutterProps {
    editor: Editor | null;
    comments: Comment[];
    activeNodeId: string | null;
    setActiveNodeId: (id: string | null) => void;
    /** Create a new empty comment anchored to the node and keep its thread open. */
    onAddComment: (nodeId: string) => void;
    onUpdateComment: (id: string, data: Partial<Comment>) => void;
    onDeleteComment: (id: string) => void;
    onResolveComment: (id: string) => void;
    onAddReply: (commentId: string, text: string, author: string) => void;
}

/**
 * Renders a comment icon in the editor's left margin for every node that has an
 * unresolved discussion. Clicking an icon opens that node's discussion thread in
 * a popover anchored next to the icon.
 */
const CommentGutter = ({
    editor,
    comments,
    activeNodeId,
    setActiveNodeId,
    onAddComment,
    onUpdateComment,
    onDeleteComment,
    onResolveComment,
    onAddReply,
}: CommentGutterProps) => {
    const { user } = useUser();
    const { showComments } = useViewContext();
    const [icons, setIcons] = useState<IconPos[]>([]);

    // RAF handles to avoid layout thrashing on rapid transactions / resizes.
    const txDebounceRef = useRef<number | null>(null);
    const resizeThrottleRef = useRef<number | null>(null);

    // Unresolved comments grouped by their anchor node, in document order is
    // applied later via the computed icon tops.
    const commentsByNode = useMemo(() => {
        const map = new Map<string, Comment[]>();
        for (const c of comments) {
            if (c.resolved) continue;
            const list = map.get(c.nodeId);
            if (list) list.push(c);
            else map.set(c.nodeId, [c]);
        }
        // Keep each thread chronological.
        for (const list of map.values()) list.sort((a, b) => a.createdAt - b.createdAt);
        return map;
    }, [comments]);

    const computePositions = useCallback(() => {
        if (!editor || editor.isDestroyed || !editor.view?.dom || !showComments) {
            setIcons([]);
            return;
        }

        const editorDom = editor.view.dom;
        const scrollContainer = editorDom.closest("[class*='container']") as HTMLElement | null;
        if (!scrollContainer) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const editorRect = editorDom.getBoundingClientRect();
        const left = editorRect.left - containerRect.left + GUTTER_INSET;

        const nodePositions = getNodePositions(editor);
        const next: IconPos[] = [];

        for (const [nodeId, list] of commentsByNode) {
            const pos = nodePositions.get(nodeId);
            if (!pos) continue; // node was deleted — orphaned comment, no icon
            try {
                const coords = editor.view.coordsAtPos(pos.from);
                const top = coords.top - containerRect.top + scrollContainer.scrollTop;
                next.push({ nodeId, top, left, count: list.length });
            } catch {
                // Position out of range
            }
        }

        next.sort((a, b) => a.top - b.top);
        setIcons(next);
    }, [editor, commentsByNode, showComments]);

    // Recompute on mount and whenever the comment set changes. Deferred to the
    // next frame so the editor DOM is laid out before we measure positions.
    useEffect(() => {
        const raf = requestAnimationFrame(computePositions);
        return () => cancelAnimationFrame(raf);
    }, [computePositions]);

    // Recompute on document edits and container/window resizes.
    useEffect(() => {
        if (!editor || editor.isDestroyed || !showComments) return;

        const handleTransaction = ({ transaction }: { transaction: Transaction }) => {
            if (!transaction.docChanged) return;
            if (txDebounceRef.current !== null) cancelAnimationFrame(txDebounceRef.current);
            txDebounceRef.current = requestAnimationFrame(() => {
                txDebounceRef.current = null;
                computePositions();
            });
        };
        editor.on("transaction", handleTransaction);
        window.addEventListener("resize", computePositions);

        const scrollContainer = editor.view?.dom.closest("[class*='container']") as HTMLElement | null;
        let resizeObserver: ResizeObserver | undefined;
        if (scrollContainer) {
            resizeObserver = new ResizeObserver(() => {
                if (resizeThrottleRef.current !== null) return;
                resizeThrottleRef.current = requestAnimationFrame(() => {
                    resizeThrottleRef.current = null;
                    computePositions();
                });
            });
            resizeObserver.observe(scrollContainer);
        }

        return () => {
            editor.off("transaction", handleTransaction);
            window.removeEventListener("resize", computePositions);
            resizeObserver?.disconnect();
            if (txDebounceRef.current !== null) cancelAnimationFrame(txDebounceRef.current);
            if (resizeThrottleRef.current !== null) cancelAnimationFrame(resizeThrottleRef.current);
        };
    }, [editor, computePositions, showComments]);

    if (!showComments || icons.length === 0) return null;

    const activeIcon = activeNodeId ? icons.find((i) => i.nodeId === activeNodeId) : undefined;
    const activeComments = activeNodeId ? commentsByNode.get(activeNodeId) ?? [] : [];

    // Anchor the popover to the right of its icon, clamped to the scroll container.
    let popoverLeft = 0;
    if (activeIcon) {
        const scrollContainer = editor?.view?.dom.closest("[class*='container']") as HTMLElement | null;
        const containerWidth = scrollContainer?.clientWidth ?? 0;
        const ideal = activeIcon.left + ICON_SIZE + POPOVER_GAP;
        const maxLeft = Math.max(8, containerWidth - POPOVER_WIDTH - 8);
        popoverLeft = Math.min(ideal, maxLeft);
    }

    return (
        <>
            {icons.map((icon) => {
                const isActive = icon.nodeId === activeNodeId;
                return (
                    <button
                        key={icon.nodeId}
                        className={`${styles.gutter_icon} ${isActive ? styles.gutter_icon_active : ""}`}
                        style={{ top: icon.top, left: icon.left }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveNodeId(isActive ? null : icon.nodeId);
                        }}
                        title={icon.count > 1 ? `${icon.count} comments` : "1 comment"}
                    >
                        <MessageSquare size={13} />
                        {icon.count > 1 && <span className={styles.gutter_count}>{icon.count}</span>}
                    </button>
                );
            })}

            {activeIcon && (
                <div
                    className={styles.thread}
                    style={{ top: activeIcon.top, left: popoverLeft, width: POPOVER_WIDTH }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={styles.thread_header}>
                        <span className={styles.thread_title}>Discussion</span>
                        <button
                            className={styles.thread_close}
                            onClick={() => setActiveNodeId(null)}
                            title="Close"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div className={styles.thread_body}>
                        {activeComments.map((comment) => (
                            <CommentCard
                                key={comment.id}
                                comment={comment}
                                onUpdate={(data) => onUpdateComment(comment.id, data)}
                                onResolve={() => onResolveComment(comment.id)}
                                onDelete={() => onDeleteComment(comment.id)}
                                onReply={(text) => onAddReply(comment.id, text, user?.username || "Anonymous")}
                            />
                        ))}
                    </div>

                    <button className={styles.thread_add} onClick={() => onAddComment(activeNodeId!)}>
                        <Plus size={14} /> Add comment
                    </button>
                </div>
            )}
        </>
    );
};

export default CommentGutter;
