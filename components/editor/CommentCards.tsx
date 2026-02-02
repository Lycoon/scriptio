"use client";

import { useContext, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { ProjectContext } from "@src/context/ProjectContext";
import { Comment, CommentReply } from "@src/lib/utils/types";
import { Check, Send, X } from "lucide-react";
import { useUser } from "@src/lib/utils/hooks";
import { getCommentPositions } from "@src/lib/screenplay/extensions/comment-highlight-extension";
import styles from "./CommentCard.module.css";

function formatTimestamp(ts: number): string {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
}

// -------------------------------- //
//          Reply bubble            //
// -------------------------------- //

const ReplyBubble = ({ reply }: { reply: CommentReply }) => (
    <div className={styles.reply}>
        <div className={styles.reply_header}>
            <span className={styles.comment_author}>{reply.author}</span>
            <span className={styles.comment_time}>{formatTimestamp(reply.createdAt)}</span>
        </div>
        <div className={styles.reply_text}>{reply.text}</div>
    </div>
);

// -------------------------------- //
//          Comment card             //
// -------------------------------- //

type CommentCardProps = {
    comment: Comment;
    isActive: boolean;
    onActivate: () => void;
    onDeactivate: () => void;
    onResolve: () => void;
    onSave: (text: string) => void;
    onDelete: () => void;
    onReply: (text: string) => void;
};

const CommentCard = ({ comment, isActive, onActivate, onDeactivate, onResolve, onSave, onDelete, onReply }: CommentCardProps) => {
    const isNew = comment.text === "";
    const [isEditing, setIsEditing] = useState(isNew);
    const [draft, setDraft] = useState(comment.text);
    const [replyDraft, setReplyDraft] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus({ preventScroll: true });
        }
    }, [isEditing]);

    const handleSubmit = () => {
        const trimmed = draft.trim();
        if (!trimmed) {
            if (isNew) onDelete();
            return;
        }
        onSave(trimmed);
        setIsEditing(false);
    };

    const handleCancel = () => {
        if (isNew) {
            onDelete();
        } else {
            setDraft(comment.text);
            setIsEditing(false);
        }
    };

    const handleReplySubmit = () => {
        const trimmed = replyDraft.trim();
        if (!trimmed) return;
        onReply(trimmed);
        setReplyDraft("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            handleCancel();
        }
        e.stopPropagation();
    };

    const handleReplyKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleReplySubmit();
        }
        e.stopPropagation();
    };

    const replies = comment.replies ?? [];

    // Compact card for non-active comments
    if (!isActive && !isNew) {
        return (
            <div className={styles.comment_card} onClick={(e) => { e.stopPropagation(); onActivate(); }}>
                <div className={styles.comment_header}>
                    <span className={styles.comment_author}>{comment.author}</span>
                    <span className={styles.comment_time}>{formatTimestamp(comment.createdAt)}</span>
                </div>
                <div className={styles.comment_text}>{comment.text}</div>
                {replies.length > 0 && (
                    <div className={styles.comment_reply_count}>
                        {replies.length} {replies.length === 1 ? "reply" : "replies"}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`${styles.comment_card} ${styles.comment_card_active}`} onClick={(e) => e.stopPropagation()}>
            {/* Original comment */}
            <div className={styles.comment_header}>
                <span className={styles.comment_author}>{comment.author}</span>
                <span className={styles.comment_time}>{formatTimestamp(comment.createdAt)}</span>
            </div>

            {isEditing ? (
                <>
                    <textarea
                        ref={textareaRef}
                        className={styles.comment_input}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Write a comment..."
                    />
                    <div className={styles.comment_submit_row}>
                        <button className={styles.comment_cancel_btn} onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
                            Cancel
                        </button>
                        <button className={styles.comment_submit_btn} onClick={(e) => { e.stopPropagation(); handleSubmit(); }}>
                            Save
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className={styles.comment_text}>{comment.text}</div>

                    {/* Replies */}
                    {replies.length > 0 && (
                        <div className={styles.replies}>
                            {replies.map((r) => (
                                <ReplyBubble key={r.id} reply={r} />
                            ))}
                        </div>
                    )}

                    {/* Reply input */}
                    <div className={styles.reply_input_row}>
                        <textarea
                            className={styles.reply_input}
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.target.value)}
                            onKeyDown={handleReplyKeyDown}
                            placeholder="Reply..."
                            rows={1}
                        />
                        <button
                            className={styles.reply_send_btn}
                            onClick={(e) => { e.stopPropagation(); handleReplySubmit(); }}
                            disabled={!replyDraft.trim()}
                            title="Send reply"
                        >
                            <Send size={14} />
                        </button>
                    </div>

                    {/* Actions: Cancel + Resolve */}
                    <div className={styles.comment_actions}>
                        <button className={styles.comment_btn} onClick={(e) => { e.stopPropagation(); onDeactivate(); }} title="Cancel">
                            <X size={14} /> Cancel
                        </button>
                        <button className={`${styles.comment_btn} ${styles.comment_btn_resolve}`} onClick={(e) => { e.stopPropagation(); onResolve(); }} title="Resolve">
                            <Check size={14} /> Resolve
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

// -------------------------------- //
//       Comment cards container     //
// -------------------------------- //

const CARD_GAP = 8;

const CommentCards = () => {
    const { editor, comments, activeCommentId, setActiveCommentId, repository } = useContext(ProjectContext);
    const { user } = useUser();
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    const unresolvedComments = useMemo(
        () => comments.filter((c) => !c.resolved),
        [comments],
    );

    // Centralized positioning: iterate sorted cards, push down to avoid overlap.
    // Reads positions from comment marks in the document.
    const positionCards = useCallback(() => {
        if (!editor || editor.isDestroyed || !editor.view?.dom) return;

        const editorDom = editor.view.dom;
        const scrollContainer = editorDom.closest("[class*='container']") as HTMLElement | null;
        if (!scrollContainer) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const editorRect = editorDom.getBoundingClientRect();
        const CARD_WIDTH = 250;
        const idealLeft = editorRect.right - containerRect.left + 12;
        const maxLeft = containerRect.width - CARD_WIDTH - 8;
        const left = Math.min(idealLeft, Math.max(0, maxLeft));
        const markPositions = getCommentPositions(editor);

        // Sort comments by their position in the document
        const sorted = [...unresolvedComments]
            .filter((c) => markPositions.has(c.id))
            .sort((a, b) => (markPositions.get(a.id)!.from - markPositions.get(b.id)!.from));

        let nextAvailableTop = 0;

        for (const comment of sorted) {
            const el = cardRefs.current.get(comment.id);
            if (!el) continue;

            const from = markPositions.get(comment.id)!.from;

            try {
                const coords = editor.view.coordsAtPos(from);
                const idealTop = coords.top - containerRect.top + scrollContainer.scrollTop;
                const top = Math.max(idealTop, nextAvailableTop);

                el.style.top = `${top}px`;
                el.style.left = `${left}px`;

                nextAvailableTop = top + el.offsetHeight + CARD_GAP;
            } catch {
                // Position out of range
            }
        }
    }, [editor, unresolvedComments]);

    // Position on mount and when comments change
    useEffect(() => {
        positionCards();
    }, [positionCards]);

    // Reposition on document changes, window resize, and container resize (zen mode, split view, etc.)
    useEffect(() => {
        if (!editor || editor.isDestroyed) return;

        const handleTransaction = ({ transaction }: any) => {
            if (transaction.docChanged) positionCards();
        };
        editor.on("transaction", handleTransaction);
        window.addEventListener("resize", positionCards);

        const editorDom = editor.view?.dom;
        const scrollContainer = editorDom?.closest("[class*='container']") as HTMLElement | null;
        let resizeObserver: ResizeObserver | undefined;
        if (scrollContainer) {
            resizeObserver = new ResizeObserver(positionCards);
            resizeObserver.observe(scrollContainer);
        }

        return () => {
            editor.off("transaction", handleTransaction);
            window.removeEventListener("resize", positionCards);
            resizeObserver?.disconnect();
        };
    }, [editor, positionCards]);

    // Reposition after active card changes (expanded height differs from compact)
    useEffect(() => {
        requestAnimationFrame(positionCards);
    }, [activeCommentId, positionCards]);

    const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
        if (el) cardRefs.current.set(id, el);
        else cardRefs.current.delete(id);
    }, []);

    if (unresolvedComments.length === 0) return null;

    return (
        <>
            {unresolvedComments.map((comment) => {
                const isActive = comment.id === activeCommentId;
                return (
                    <div
                        key={comment.id}
                        ref={(el) => setCardRef(comment.id, el)}
                        style={{ position: "absolute", zIndex: isActive ? 11 : 10 }}
                    >
                        <CommentCard
                            comment={comment}
                            isActive={isActive}
                            onActivate={() => setActiveCommentId(comment.id)}
                            onDeactivate={() => setActiveCommentId(null)}
                            onResolve={() => {
                                editor?.commands.unsetComment(comment.id);
                                repository?.resolveComment(comment.id);
                                setActiveCommentId(null);
                            }}
                            onSave={(text: string) => {
                                repository?.updateComment(comment.id, { text });
                            }}
                            onDelete={() => {
                                editor?.commands.unsetComment(comment.id);
                                repository?.deleteComment(comment.id);
                                setActiveCommentId(null);
                            }}
                            onReply={(text: string) => {
                                repository?.addReply(comment.id, {
                                    text,
                                    author: user?.username || "Anonymous",
                                    createdAt: Date.now(),
                                });
                            }}
                        />
                    </div>
                );
            })}
        </>
    );
};

export default CommentCards;
