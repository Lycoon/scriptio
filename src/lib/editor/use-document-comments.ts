"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as Y from "yjs";
import { Comment, CommentReply } from "@src/lib/utils/types";
import type { ProjectRepository } from "@src/lib/project/project-repository";

export interface DocumentCommentOps {
    comments: Comment[];
    /** data-id of the node whose discussion is currently open, or null. */
    activeNodeId: string | null;
    setActiveNodeId: (id: string | null) => void;
    addComment: (partial: Omit<Comment, "id">) => string;
    updateComment: (id: string, data: Partial<Comment>) => void;
    deleteComment: (id: string) => void;
    addReply: (commentId: string, reply: Omit<CommentReply, "id">) => string | undefined;
    resolveComment: (id: string) => void;
}

/**
 * Manages per-document comment state against a specific Y.Map.
 * When commentsMap is null all state is empty and all ops are no-ops.
 */
export const useDocumentComments = (
    commentsMap: Y.Map<Comment> | null | undefined,
    repository: ProjectRepository | null,
): DocumentCommentOps => {
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

    // Refs so CRUD callbacks do not need to be recreated on every map/repo change
    const mapRef = useRef(commentsMap);
    useEffect(() => { mapRef.current = commentsMap; }, [commentsMap]);

    const repoRef = useRef(repository);
    useEffect(() => { repoRef.current = repository; }, [repository]);

    const commentsCache = useRef<Comment[]>([]);
    const comments = useSyncExternalStore(
        useCallback((callback: () => void) => {
            if (!commentsMap) {
                commentsCache.current = [];
                return () => {};
            }
            commentsCache.current = Object.values(commentsMap.toJSON() as Record<string, Comment>);
            const observer = () => {
                commentsCache.current = Object.values(commentsMap.toJSON() as Record<string, Comment>);
                callback();
            };
            commentsMap.observe(observer);
            return () => commentsMap.unobserve(observer);
        }, [commentsMap]),
        () => commentsCache.current,
        () => [],
    );

    const addComment = useCallback((partial: Omit<Comment, "id">): string => {
        const repo = repoRef.current;
        const map = mapRef.current;
        if (!repo || !map) return "";
        return repo.addCommentToMap(map, partial);
    }, []);

    const updateComment = useCallback((id: string, data: Partial<Comment>): void => {
        const repo = repoRef.current;
        const map = mapRef.current;
        if (!repo || !map) return;
        repo.updateCommentInMap(map, id, data);
    }, []);

    const deleteComment = useCallback((id: string): void => {
        const repo = repoRef.current;
        const map = mapRef.current;
        if (!repo || !map) return;
        repo.deleteCommentFromMap(map, id);
    }, []);

    const addReply = useCallback((commentId: string, reply: Omit<CommentReply, "id">): string | undefined => {
        const repo = repoRef.current;
        const map = mapRef.current;
        if (!repo || !map) return undefined;
        return repo.addReplyToMap(map, commentId, reply);
    }, []);

    const resolveComment = useCallback((id: string): void => {
        const repo = repoRef.current;
        const map = mapRef.current;
        if (!repo || !map) return;
        repo.resolveCommentInMap(map, id);
    }, []);

    return {
        comments,
        activeNodeId,
        setActiveNodeId,
        addComment,
        updateComment,
        deleteComment,
        addReply,
        resolveComment,
    };
};
