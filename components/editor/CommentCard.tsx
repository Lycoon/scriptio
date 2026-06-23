"use client";

import { useEffect, useRef, useState } from "react";
import { Comment, CommentReply } from "@src/lib/utils/types";
import { Check, Pencil, Send, Trash2 } from "lucide-react";
import { useFormatTimestamp } from "@src/lib/utils/hooks";
import styles from "./CommentCard.module.css";

// -------------------------------- //
//          Reply bubble            //
// -------------------------------- //

type ReplyBubbleProps = {
    reply: CommentReply;
    onSave: (text: string) => void;
    onDelete: () => void;
};

const ReplyBubble = ({ reply, onSave, onDelete }: ReplyBubbleProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(reply.text);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const formatTimestamp = useFormatTimestamp();

    useEffect(() => {
        if (isEditing && textareaRef.current) textareaRef.current.focus({ preventScroll: true });
    }, [isEditing]);

    const handleSave = () => {
        const trimmed = draft.trim();
        if (!trimmed) return;
        onSave(trimmed);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSave();
        }
        if (e.key === "Escape") {
            e.preventDefault();
            setDraft(reply.text);
            setIsEditing(false);
        }
        e.stopPropagation();
    };

    return (
        <div className={styles.reply}>
            <div className={styles.reply_header}>
                <span className={styles.comment_author}>{reply.author}</span>
                <div className={styles.reply_meta}>
                    <span className={styles.comment_time}>{formatTimestamp(reply.createdAt)}</span>
                    {!isEditing && (
                        <div className={styles.reply_actions}>
                            <button
                                className={styles.comment_btn}
                                onClick={() => setIsEditing(true)}
                                title="Edit"
                                aria-label="Edit reply"
                            >
                                <Pencil size={13} />
                            </button>
                            <button
                                className={`${styles.comment_btn} ${styles.comment_btn_danger}`}
                                onClick={onDelete}
                                title="Delete"
                                aria-label="Delete reply"
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {isEditing ? (
                <>
                    <textarea
                        ref={textareaRef}
                        className={styles.reply_input}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={2}
                    />
                    <div className={styles.comment_submit_row}>
                        <button
                            className={styles.comment_cancel_btn}
                            onClick={() => {
                                setDraft(reply.text);
                                setIsEditing(false);
                            }}
                        >
                            Cancel
                        </button>
                        <button className={styles.comment_submit_btn} onClick={handleSave}>
                            Save
                        </button>
                    </div>
                </>
            ) : (
                <div className={styles.reply_text}>{reply.text}</div>
            )}
        </div>
    );
};

// -------------------------------- //
//          Comment card            //
// -------------------------------- //

export type CommentCardProps = {
    comment: Comment;
    onUpdate: (data: Partial<Comment>) => void;
    onDelete: () => void;
    onResolve: () => void;
    onReply: (text: string) => void;
};

/**
 * A single comment within a node's discussion thread: author/time header with
 * resolve/edit/delete actions, the comment body (editable for new or in-edit
 * comments), its replies (each individually editable/deletable), and a reply
 * input.
 */
const CommentCard = ({ comment, onUpdate, onDelete, onResolve, onReply }: CommentCardProps) => {
    const isNew = comment.text === "";
    const [isEditing, setIsEditing] = useState(isNew);
    const [draft, setDraft] = useState(comment.text);
    const [replyDraft, setReplyDraft] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const formatTimestamp = useFormatTimestamp();

    const replies = comment.replies ?? [];

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
        onUpdate({ text: trimmed });
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

    const editReply = (replyId: string, text: string) => {
        onUpdate({ replies: replies.map((r) => (r.id === replyId ? { ...r, text } : r)) });
    };

    const deleteReply = (replyId: string) => {
        onUpdate({ replies: replies.filter((r) => r.id !== replyId) });
    };

    return (
        <div className={styles.comment_card}>
            <div className={styles.comment_header}>
                <div className={styles.comment_meta}>
                    <span className={styles.comment_author}>{comment.author}</span>
                    <span className={styles.comment_time}>{formatTimestamp(comment.createdAt)}</span>
                </div>

                {/* Icon actions, revealed on card hover/focus (see CSS). */}
                {!isEditing && (
                    <div className={styles.comment_actions}>
                        <button
                            className={`${styles.comment_btn} ${styles.comment_btn_resolve}`}
                            onClick={onResolve}
                            title="Resolve"
                            aria-label="Resolve"
                        >
                            <Check size={14} />
                        </button>
                        <button
                            className={styles.comment_btn}
                            onClick={() => setIsEditing(true)}
                            title="Edit"
                            aria-label="Edit"
                        >
                            <Pencil size={14} />
                        </button>
                        <button
                            className={`${styles.comment_btn} ${styles.comment_btn_danger}`}
                            onClick={onDelete}
                            title="Delete"
                            aria-label="Delete"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
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
                        <button className={styles.comment_cancel_btn} onClick={handleCancel}>
                            Cancel
                        </button>
                        <button className={styles.comment_submit_btn} onClick={handleSubmit}>
                            Save
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className={styles.comment_text}>{comment.text}</div>

                    {replies.length > 0 && (
                        <div className={styles.replies}>
                            {replies.map((r) => (
                                <ReplyBubble
                                    key={r.id}
                                    reply={r}
                                    onSave={(text) => editReply(r.id, text)}
                                    onDelete={() => deleteReply(r.id)}
                                />
                            ))}
                        </div>
                    )}

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
                            onClick={handleReplySubmit}
                            disabled={!replyDraft.trim()}
                            title="Send reply"
                        >
                            <Send size={14} />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default CommentCard;
