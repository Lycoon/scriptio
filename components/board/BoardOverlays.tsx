"use client";

import { useTranslations } from "next-intl";
import { Link, Minus, MoveDiagonal2, Plus, Scissors, Square } from "lucide-react";
import styles from "./BoardCanvas.module.css";
import { BoardTool } from "./board-constants";

/** Seconds → `m:ss` for the recording indicator. */
function formatRecordingTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export const RecordingIndicator = ({
    elapsed,
    onStop,
}: {
    elapsed: number;
    onStop: () => void;
}) => {
    const t = useTranslations("board");
    return (
        <div className={styles.recording_indicator}>
            <span className={styles.recording_dot} />
            <span className={styles.recording_time}>{formatRecordingTime(elapsed)}</span>
            <button className={styles.recording_stop} onClick={onStop}>
                <Square size={12} />
                <span className="unselectable">{t("stopRecording")}</span>
            </button>
        </div>
    );
};

/**
 * Link / cut / resize tools. Touch only: with a pointer the corner node and the
 * link's right-click menu are already precise enough, and the board keeps its
 * uncluttered desktop chrome.
 */
export const BoardToolControls = ({
    tool,
    onSelectTool,
}: {
    tool: BoardTool;
    onSelectTool: (tool: BoardTool) => void;
}) => {
    const t = useTranslations("board");
    const tools: { id: BoardTool; icon: typeof Link; label: string }[] = [
        { id: "link", icon: Link, label: t("linkCards") },
        { id: "cut", icon: Scissors, label: t("cutLinks") },
        { id: "resize", icon: MoveDiagonal2, label: t("resizeCards") },
    ];

    return (
        <div className={styles.tool_controls}>
            {tools.map(({ id, icon: Icon, label }) => (
                <button
                    key={id}
                    type="button"
                    aria-pressed={tool === id}
                    aria-label={label}
                    className={`${styles.tool_btn} ${tool === id ? styles.tool_btn_active : ""}`}
                    onClick={() => onSelectTool(id)}
                >
                    <Icon size={18} />
                </button>
            ))}
        </div>
    );
};

/**
 * What the armed tool is waiting for. The tools are modal and the pressed
 * button is the only other sign of it, so the step being asked for is spelled
 * out until the tool is put down.
 */
export const BoardToolHint = ({
    tool,
    hasLinkSource,
}: {
    tool: BoardTool;
    hasLinkSource: boolean;
}) => {
    const t = useTranslations("board");
    if (tool === "select") return null;

    const hint =
        tool === "cut"
            ? t("cutHint")
            : tool === "resize"
              ? t("resizeHint")
              : hasLinkSource
                ? t("linkHintTarget")
                : t("linkHintSource");

    return <div className={styles.tool_hint}>{hint}</div>;
};

/** Zoom buttons — hidden on phone, where pinch-to-zoom replaces them. */
export const BoardZoomControls = ({
    scale,
    onZoom,
}: {
    scale: number;
    onZoom: (zoomIn: boolean) => void;
}) => (
    <div className={styles.zoom_controls}>
        <button className={styles.zoom_btn} onClick={() => onZoom(false)}>
            <Minus size={14} />
        </button>
        <span className={styles.zoom_level}>{Math.round(scale * 100)}%</span>
        <button className={styles.zoom_btn} onClick={() => onZoom(true)}>
            <Plus size={14} />
        </button>
    </div>
);
