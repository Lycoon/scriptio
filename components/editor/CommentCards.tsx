"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Comment, CommentReply } from "@src/lib/utils/types";
import { Send, Trash2, X } from "lucide-react";
import { useUser } from "@src/lib/utils/hooks";
import { getCommentPositions } from "@src/lib/screenplay/extensions/comment-highlight-extension";
import { useViewContext } from "@src/context/ViewContext";
import { Editor } from "@tiptap/react";
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
    onSave: (text: string) => void;
    onDelete: () => void;
    onReply: (text: string) => void;
};

const CommentCard = ({ comment, isActive, onActivate, onDeactivate, onSave, onDelete, onReply }: CommentCardProps) => {
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
        onDeactivate();
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
            <div className={styles.comment_card} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onActivate(); }}>
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
        <div className={`${styles.comment_card} ${styles.comment_card_active}`} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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

                    {/* Actions: Cancel + Delete */}
                    <div className={styles.comment_actions}>
                        <button className={styles.comment_btn} onClick={(e) => { e.stopPropagation(); onDeactivate(); }} title="Cancel">
                            <X size={14} /> Cancel
                        </button>
                        <button className={`${styles.comment_btn} ${styles.comment_btn_danger}`} onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete">
                            <Trash2 size={14} /> Delete
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

type ActiveLine = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    svgHeight: number;
};

export interface CommentCardsProps {
    editor: Editor | null;
    comments: Comment[];
    activeCommentId: string | null;
    setActiveCommentId: (id: string | null) => void;
    onUpdateComment: (id: string, data: Partial<Comment>) => void;
    onDeleteComment: (id: string) => void;
    onAddReply: (commentId: string, text: string, author: string) => void;
}

const CommentCards = ({
    editor,
    comments,
    activeCommentId,
    setActiveCommentId,
    onUpdateComment,
    onDeleteComment,
    onAddReply,
}: CommentCardsProps) => {
    const { user } = useUser();
    const { showComments } = useViewContext();
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const [activeLine, setActiveLine] = useState<ActiveLine | null>(null);

    // Performance: RAF debouncing refs to prevent layout thrashing
    const transactionDebounceRef = useRef<number | null>(null);
    const resizeThrottleRef = useRef<number | null>(null);

    const unresolvedComments = useMemo(
        () => comments.filter((c) => !c.resolved),
        [comments],
    );

    // Centralized positioning: iterate sorted cards, push down to avoid overlap.
    // Reads positions from comment marks in the document.
    const positionCards = useCallback(() => {
        if (!editor || editor.isDestroyed || !editor.view?.dom || !showComments) return;

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

    }, [editor, unresolvedComments, showComments]);

    // Position on mount and when comments change
    useEffect(() => {
        positionCards();
    }, [positionCards]);

    // Reposition on document changes, window resize, and container resize (zen mode, split view, etc.)
    useEffect(() => {
        if (!editor || editor.isDestroyed || !showComments) return;

        // Performance: Debounce transaction handler to prevent layout thrashing during typing
        const handleTransaction = ({ transaction }: any) => {
            if (!transaction.docChanged) return;
            if (transactionDebounceRef.current !== null) {
                cancelAnimationFrame(transactionDebounceRef.current);
            }
            transactionDebounceRef.current = requestAnimationFrame(() => {
                transactionDebounceRef.current = null;
                positionCards();
            });
        };
        editor.on("transaction", handleTransaction);
        window.addEventListener("resize", positionCards);

        const editorDom = editor.view?.dom;
        const scrollContainer = editorDom?.closest("[class*='container']") as HTMLElement | null;
        let resizeObserver: ResizeObserver | undefined;
        if (scrollContainer) {
            // Performance: Throttle ResizeObserver to once per animation frame
            resizeObserver = new ResizeObserver(() => {
                if (resizeThrottleRef.current !== null) return;
                resizeThrottleRef.current = requestAnimationFrame(() => {
                    resizeThrottleRef.current = null;
                    positionCards();
                });
            });
            resizeObserver.observe(scrollContainer);
        }

        return () => {
            editor.off("transaction", handleTransaction);
            window.removeEventListener("resize", positionCards);
            resizeObserver?.disconnect();
            // Cleanup pending animation frames
            if (transactionDebounceRef.current !== null) {
                cancelAnimationFrame(transactionDebounceRef.current);
            }
            if (resizeThrottleRef.current !== null) {
                cancelAnimationFrame(resizeThrottleRef.current);
            }
        };
    }, [editor, positionCards, showComments]);

    // Reposition after active card changes (expanded height differs from compact)
    // Also compute the connecting line for the active comment
    useEffect(() => {
        if (!showComments) {
            setActiveLine(null);
            return;
        }

        requestAnimationFrame(() => {
            positionCards();

            // Compute connecting line only for active comment
            if (!activeCommentId || !editor || editor.isDestroyed || !editor.view?.dom) {
                setActiveLine(null);
                return;
            }

            const el = cardRefs.current.get(activeCommentId);
            if (!el) { setActiveLine(null); return; }

            const markPositions = getCommentPositions(editor);
            const range = markPositions.get(activeCommentId);
            if (!range) { setActiveLine(null); return; }

            const editorDom = editor.view.dom;
            const scrollContainer = editorDom.closest("[class*='container']") as HTMLElement | null;
            if (!scrollContainer) { setActiveLine(null); return; }

            try {
                const containerRect = scrollContainer.getBoundingClientRect();
                const fromCoords = editor.view.coordsAtPos(range.from);
                const toCoords = editor.view.coordsAtPos(range.to);
                const lineHeight = fromCoords.bottom - fromCoords.top;

                setActiveLine({
                    x1: toCoords.right - containerRect.left,
                    y1: fromCoords.top - containerRect.top + scrollContainer.scrollTop + lineHeight / 2,
                    x2: parseFloat(el.style.left),
                    y2: parseFloat(el.style.top) + el.offsetHeight / 2,
                    svgHeight: scrollContainer.scrollHeight,
                });
            } catch {
                setActiveLine(null);
            }
        });
    }, [activeCommentId, positionCards, editor, showComments]);

    const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
        if (el) cardRefs.current.set(id, el);
        else cardRefs.current.delete(id);
    }, []);

    if (!showComments || unresolvedComments.length === 0) return null;

    return (
        <>
            {activeLine && (
                <svg
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: activeLine.svgHeight,
                        pointerEvents: "none",
                        zIndex: 9,
                    }}
                >
                    <path
                        d={`M ${activeLine.x1} ${activeLine.y1} C ${(activeLine.x1 + activeLine.x2) / 2} ${activeLine.y1}, ${(activeLine.x1 + activeLine.x2) / 2} ${activeLine.y2}, ${activeLine.x2} ${activeLine.y2}`}
                        stroke="rgba(255, 213, 0, 0.4)"
                        strokeWidth={1.5}
                        fill="none"
                    />
                </svg>
            )}
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
                            onSave={(text: string) => {
                                onUpdateComment(comment.id, { text });
                            }}
                            onDelete={() => {
                                editor?.commands.unsetComment(comment.id);
                                onDeleteComment(comment.id);
                                setActiveCommentId(null);
                            }}
                            onReply={(text: string) => {
                                onAddReply(comment.id, text, user?.username || "Anonymous");
                            }}
                        />
                    </div>
                );
            })}
        </>
    );
};

export default CommentCards;
