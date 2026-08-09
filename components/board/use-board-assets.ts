"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { BoardCardData } from "@src/lib/project/project-state";
import { importAudioFile, importImageFile, syncAssetToCloud } from "@src/lib/assets/asset-store";
import { CloudQuotaError } from "@src/lib/assets/cloud-asset-sync";
import { createAudioCard, createImageCard } from "./board-cards";
import { useAudioRecorder } from "./use-audio-recorder";
import { BoardCamera } from "./use-board-camera";

/** How long the transient asset-error banner stays up. */
const ASSET_ERROR_MS = 4000;
/** Canvas-px stagger between cards created from a multi-file drop. */
const DROP_STAGGER = 24;

/**
 * Bringing media onto the board: OS file drops, the image picker, and voice
 * notes. Each import stores the bytes locally first and drops its card
 * immediately, then uploads in the background — so the card appears at once and
 * still renders offline.
 */
export function useBoardAssets(
    camera: BoardCamera,
    cards: {
        addCards: (cards: BoardCardData[]) => void;
        removeCards: (ids: Set<string>) => void;
    },
) {
    const { projectId, isReadOnly } = useContext(ProjectContext);
    const t = useTranslations("board");
    const recorder = useAudioRecorder();
    const { addCards, removeCards } = cards;
    const { toCanvasPoint } = camera;

    const [isDraggingFile, setIsDraggingFile] = useState(false);
    /** Transient banner shown when an asset can't be saved (e.g. cloud quota). */
    const [assetError, setAssetError] = useState<string | null>(null);
    const assetErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const imageInput = useRef<HTMLInputElement | null>(null);
    /** Callback ref, so the input element is wired up without handing a ref out. */
    const setImageInput = useCallback((el: HTMLInputElement | null) => {
        imageInput.current = el;
    }, []);
    const imageImportCoords = useRef({ x: 0, y: 0 });
    /** Canvas-space coords captured when recording starts, for the resulting card. */
    const recordCoords = useRef({ x: 0, y: 0 });

    const showAssetError = useCallback((message: string) => {
        setAssetError(message);
        if (assetErrorTimer.current) clearTimeout(assetErrorTimer.current);
        assetErrorTimer.current = setTimeout(() => setAssetError(null), ASSET_ERROR_MS);
    }, []);

    useEffect(
        () => () => {
            if (assetErrorTimer.current) clearTimeout(assetErrorTimer.current);
        },
        [],
    );

    // Upload the new cards' assets to the cloud in the background. If an upload
    // is rejected for quota, roll that card back and explain why.
    const syncCreatedAssets = useCallback(
        (createdCards: BoardCardData[], pid: string) => {
            for (const card of createdCards) {
                if (!card.assetId) continue;
                const cardId = card.id;
                void syncAssetToCloud(pid, card.assetId).catch((err) => {
                    if (err instanceof CloudQuotaError) {
                        removeCards(new Set([cardId]));
                        showAssetError(t("storageLimitReached"));
                    } else {
                        console.error("[BoardCanvas] cloud asset upload failed:", err);
                    }
                });
            }
        },
        [removeCards, showAssetError, t],
    );

    /** Add already-built asset cards to the board and start their upload. */
    const commitAssetCards = useCallback(
        (created: BoardCardData[], pid: string) => {
            if (created.length === 0) return;
            addCards(created);
            syncCreatedAssets(created, pid);
        },
        [addCards, syncCreatedAssets],
    );

    // ── OS file drag & drop ───────────────────────────────────────────────────

    /** Highlight the canvas while an OS file drag hovers over it. */
    const handleDragOver = useCallback(
        (e: React.DragEvent) => {
            if (isReadOnly) return;
            if (!Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setIsDraggingFile(true);
        },
        [isReadOnly],
    );

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        // Ignore leave events fired when moving between the container's children.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDraggingFile(false);
    }, []);

    const handleDrop = useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault();
            setIsDraggingFile(false);
            if (isReadOnly || !projectId) return;

            const files = Array.from(e.dataTransfer.files).filter(
                (f) => f.type.startsWith("image/") || f.type.startsWith("audio/"),
            );
            if (files.length === 0) return;

            const drop = toCanvasPoint(e.clientX, e.clientY);

            const created: BoardCardData[] = [];
            for (const file of files) {
                const x = drop.x + created.length * DROP_STAGGER;
                const y = drop.y + created.length * DROP_STAGGER;
                try {
                    if (file.type.startsWith("audio/")) {
                        const { hash } = await importAudioFile(projectId, file);
                        created.push(createAudioCard(hash, x, y));
                    } else {
                        const { hash, width, height } = await importImageFile(projectId, file);
                        created.push(createImageCard(hash, width, height, x, y));
                    }
                } catch (err) {
                    console.error("[BoardCanvas] Failed to import dropped file:", err);
                }
            }

            commitAssetCards(created, projectId);
        },
        [isReadOnly, projectId, toCanvasPoint, commitAssetCards],
    );

    // ── Image picker (mobile has no drag & drop) ──────────────────────────────

    const openImagePicker = useCallback((x: number, y: number) => {
        imageImportCoords.current = { x, y };
        imageInput.current?.click();
    }, []);

    const handleImageInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || isReadOnly || !projectId) return;
            const { x, y } = imageImportCoords.current;
            void (async () => {
                try {
                    const { hash, width, height } = await importImageFile(projectId, file);
                    commitAssetCards([createImageCard(hash, width, height, x, y)], projectId);
                } catch (err) {
                    console.error("[BoardCanvas] Failed to import image:", err);
                }
            })();
        },
        [isReadOnly, projectId, commitAssetCards],
    );

    // ── Voice notes ───────────────────────────────────────────────────────────

    /** Begin recording; remember where to drop the resulting card. */
    const startRecording = useCallback(
        async (x: number, y: number) => {
            recordCoords.current = { x, y };
            try {
                await recorder.start();
            } catch (err) {
                console.error("[BoardCanvas] Microphone access failed:", err);
            }
        },
        [recorder],
    );

    /** Stop recording, store the clip as an asset, and drop an audio card. */
    const stopRecording = useCallback(async () => {
        const blob = await recorder.stop();
        if (!blob || !projectId) return;
        try {
            const { hash } = await importAudioFile(projectId, blob);
            const { x, y } = recordCoords.current;
            commitAssetCards([createAudioCard(hash, x, y)], projectId);
        } catch (err) {
            console.error("[BoardCanvas] Failed to store recording:", err);
        }
    }, [recorder, projectId, commitAssetCards]);

    return {
        recorder,
        assetError,
        isDraggingFile,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        setImageInput,
        handleImageInputChange,
        openImagePicker,
        startRecording,
        stopRecording,
    };
}
