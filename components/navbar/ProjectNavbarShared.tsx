"use client";

import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
    AppWindow,
    CircleCheckBig,
    Cloud,
    CloudOff,
    CloudUpload,
    FileText,
    Save,
    Redo2,
    TriangleAlert,
    Undo2,
    WifiOff,
    WifiSync,
} from "lucide-react";
import type { Editor } from "@tiptap/react";

import { DashboardContext } from "@src/context/DashboardContext";
import { ProjectContext } from "@src/context/ProjectContext";
import { useCookieUser, useIsPro, useIsTouch, useProjectIdFromUrl } from "@src/lib/utils/hooks";
import { useFileActions, useFileBindingStatus } from "@src/lib/persistence/use-file-binding";
import {
    fileNameOf,
    getManualSave,
    shortenPath,
    type FileBindingStatus,
} from "@src/lib/persistence/file-binding";
import { ConnectionStatus } from "@src/lib/utils/enums";
import { join } from "@src/lib/utils/misc";
import type { StorageUsage } from "@src/lib/assets/cloud-asset-sync";

import navbar from "./ProjectNavbar.module.css";
import navBtn from "@components/utils/NavbarIconButton.module.css";

/**
 * Presentational navbar pieces shared by the desktop bar ([ProjectNavbar]) and
 * the phone bar ([ProjectNavbarMobile]). Kept here so neither layout has to reach
 * into the other's file and the two can't drift.
 */

/** Human-readable byte size, e.g. 1.4 GB. */
const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
};

/** Last fetched usage, so re-hovering shows the previous numbers immediately (the
 *  panel unmounts on mouse-leave) instead of placeholders. Tagged with its project
 *  id so switching projects doesn't flash the wrong project's figures. */
let cachedStorage: { projectId: string; usage: StorageUsage } | null = null;

const StorageUsageBody = ({ projectId }: { projectId: string }) => {
    const t = useTranslations("navbar");
    const [usage, setUsage] = useState<StorageUsage | null>(() =>
        cachedStorage?.projectId === projectId ? cachedStorage.usage : null,
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { fetchProjectStorage } = await import("@src/lib/assets/cloud-asset-sync");
            const data = await fetchProjectStorage(projectId);
            // Keep the last known value on a failed refresh rather than wiping it.
            if (!cancelled && data) {
                cachedStorage = { projectId, usage: data };
                setUsage(data);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [projectId]);

    // Render the full layout immediately (stable size); only the amounts fill in
    // once fetched, so the panel doesn't grow after appearing.
    const pct = usage && usage.quota > 0 ? Math.min(100, Math.round((usage.ownerTotalUsed / usage.quota) * 100)) : 0;

    return (
        <>
            <div className={navbar.storage_row}>
                <span>{t("storageProject")}</span>
                <span>{usage ? formatBytes(usage.projectUsed) : "—"}</span>
            </div>
            <div className={navbar.storage_row}>
                <span>{t("storageTotal")}</span>
                <span>
                    {usage ? `${formatBytes(usage.ownerTotalUsed)} / ${formatBytes(usage.quota)}` : "—"}
                </span>
            </div>
            <div className={navbar.storage_bar}>
                <div className={navbar.storage_bar_fill} style={{ width: `${pct}%` }} />
            </div>
        </>
    );
};

/** What fits on one line of the save panel, which is a narrow hover surface. */
const PATH_MAX_CHARS = 44;

/**
 * What to say about a file the writer has stopped on.
 *
 * The two named cases are the ones the user can act on, and each needs its own
 * sentence: somebody replaced the file at this path with a different project's,
 * or the app has lost permission to reach it (a binding that outlived its scope
 * grant). Anything else falls back to one general sentence — the raw OS message
 * is not shown, because none of them are phrased for a reader who did not go
 * looking for them.
 */
const errorCopy = (t: (key: string) => string, message: string): string => {
    if (message === "foreign-file") return t("fileForeign");
    if (message === "no-access") return t("fileNoAccess");
    return t("fileError");
};

/** Whether a target is fine, working, needs attention, or simply isn't in use. */
type TargetTone = "ok" | "busy" | "warn" | "idle";

/**
 * One save target, stated plainly: its glyph, its name, and what it is doing.
 *
 * The glyph is deliberately the same one the title island shows, so the panel
 * reads as an expansion of those three icons rather than as a separate list the
 * user has to map back onto them.
 */
const TargetRow = ({
    icon,
    label,
    value,
    tone,
}: {
    icon: ReactNode;
    label: string;
    value: string;
    tone: TargetTone;
}) => (
    <div className={join(navbar.target_row, navbar[`target_row_${tone}`])}>
        <span className={navbar.target_row_icon}>{icon}</span>
        <span className={navbar.target_label}>{label}</span>
        <span className={navbar.target_value}>{value}</span>
    </div>
);

/** Colour for a target's glyph, matched to its tone. */
const TONE_COLOR: Record<TargetTone, string> = {
    ok: "var(--success)",
    busy: "var(--warning)",
    warn: "var(--warning)",
    idle: "var(--secondary-text)",
};

/** How the file target is doing, shared by the island glyph and the panel row. */
const fileTone = (status: FileBindingStatus): TargetTone => {
    switch (status.state) {
        case "saving":
            return "busy";
        case "saved":
            return "ok";
        case "unbound":
            return "idle";
        default:
            return "warn";
    }
};

/**
 * A call to action in the panel — the same pill the Saves panel's upgrade button
 * uses, so every prompt across the navbar's panels looks like one thing.
 *
 * No icon: at this size a glyph beside two or three words is decoration that
 * pushes the label off-centre without telling the reader anything the label
 * doesn't already say.
 */
const TargetAction = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button className={navbar.target_action} onClick={onClick}>
        {label}
    </button>
);

/**
 * Where this project is saved, as three explicit rows — each carrying whatever
 * can be done about *that* target.
 *
 * All three are always listed, including the two that never fail. A panel that
 * mentioned only what is wrong (or only what is optional) would leave the user
 * to infer the rest, and "where is my work right now" is exactly the question
 * this thing exists to answer without inference.
 *
 * The actions sit under the row they belong to rather than in one pooled list at
 * the bottom. Pooled, they were a column of near-identical phrases the user had
 * to read in full to find the one about the thing they were looking at; grouped,
 * each is answered where the question is asked — "not saved to a file" with Save
 * as… beneath it, "not synced" with the way to change that.
 *
 * Shared by the hover panel and the phone drawer so the two cannot drift.
 */
const SaveTargetsBody = ({
    projectId,
    hasCloud,
    canUploadToCloud,
    onUploadToCloud,
    extra,
    onAction,
}: {
    projectId: string;
    hasCloud: boolean;
    /** True when a local-only project could be promoted to the cloud right now. */
    canUploadToCloud?: boolean;
    onUploadToCloud?: () => void;
    /** Rendered under the cloud row (the storage meter). */
    extra?: ReactNode;
    /** Closes the drawer once an action has been taken. */
    onAction?: () => void;
}) => {
    const t = useTranslations("navbar");
    const { connectionStatus, projectTitle } = useContext(ProjectContext);
    const { openDashboard } = useContext(DashboardContext);
    const { user } = useCookieUser();
    const { isPro } = useIsPro();
    const { status, isSupported, saveAs, locate, reveal, stopSaving, compact, reclaimable } = useFileActions(
        projectId,
        projectTitle,
    );
    const path = status.state === "unbound" ? null : status.path;
    const isProblem = status.state === "missing" || status.state === "error";
    const tone = fileTone(status);
    const isSignedIn = !!user;

    const CLOUD_STATUS: Record<ConnectionStatus, string> = {
        connected: t("synced"),
        disconnected: t("noConnection"),
        connecting: t("reconnecting"),
    };
    const cloudTone: TargetTone = !hasCloud
        ? "idle"
        : connectionStatus === "connected"
          ? "ok"
          : connectionStatus === "connecting"
            ? "busy"
            : "warn";

    const fileValue = () => {
        if (status.state === "unbound") return t("fileUnbound");
        if (status.state === "saving") return t("fileSaving");
        if (isProblem) return t("fileNeedsAttention");
        // The same word the other two targets use. A file that is up to date is
        // in exactly the state they are in, and saying "2 minutes ago" here made
        // it look like the odd one out — as though it lagged the others, when
        // the whole point is that it does not.
        return t("targetLocalSaved");
    };

    const run = (action: () => void | Promise<void>) => () => {
        onAction?.();
        void action();
    };

    // Same destination the version-history gate uses, so there is one upgrade
    // route through the app rather than two that could drift apart.
    const upgrade = run(() => openDashboard(isSignedIn ? "Subscription" : "Auth", { fromMenu: true }));

    return (
        <>
            <TargetRow
                icon={<AppWindow size={14} style={{ color: TONE_COLOR.ok }} />}
                label={t("targetLocal")}
                value={t("targetLocalSaved")}
                tone="ok"
            />

            {isSupported && (
                <>
                    <TargetRow
                        icon={<FileText size={14} style={{ color: TONE_COLOR[tone] }} />}
                        label={t("targetFile")}
                        value={fileValue()}
                        tone={tone}
                    />
                    {path && (
                        <div className={navbar.file_path} title={path}>
                            {shortenPath(path, PATH_MAX_CHARS)}
                        </div>
                    )}
                    {status.state === "missing" && (
                        <div className={navbar.file_problem}>{t("fileMissing")}</div>
                    )}
                    {status.state === "error" && (
                        <div className={navbar.file_problem}>{errorCopy(t, status.message)}</div>
                    )}

                    {/* Deleting an asset writes a tombstone rather than moving
                        the bytes out, which is what keeps deleting cheap on a
                        project carrying gigabytes of them. The space comes back
                        when the file is laid out again. Phrased as what the user
                        gets — a smaller file — rather than as where the space
                        came from, which is our bookkeeping and not their
                        problem. */}
                    {reclaimable !== undefined && (
                        <div className={navbar.reclaim_card}>
                            <div className={navbar.reclaim_text}>
                                {t("fileReclaimable", { percent: Math.round(reclaimable * 100) })}
                            </div>
                            <TargetAction label={t("fileCompact")} onClick={run(compact)} />
                        </div>
                    )}

                    <div className={navbar.target_actions}>
                        {isProblem && <TargetAction label={t("fileLocate")} onClick={run(locate)} />}
                        <TargetAction label={t("fileSaveAs")} onClick={run(saveAs)} />
                        {/* The project may already have a file on this machine —
                            synced from another device, restored from a backup,
                            or bound before a reinstall. Picking it adopts it:
                            same document, so its contents merge in rather than
                            being overwritten. Worded apart from "Locate…", which
                            answers a different question (this binding's file has
                            gone; where did it go?). */}
                        {!path && (
                            <TargetAction label={t("fileUseExisting")} onClick={run(locate)} />
                        )}
                        {path && !isProblem && (
                            <TargetAction label={t("fileReveal")} onClick={run(reveal)} />
                        )}
                        {path && (
                            <TargetAction label={t("fileStopSaving")} onClick={run(stopSaving)} />
                        )}
                    </div>
                </>
            )}

            <TargetRow
                icon={
                    hasCloud ? (
                        <Cloud size={14} style={{ color: TONE_COLOR[cloudTone] }} />
                    ) : (
                        <CloudOff size={14} style={{ color: TONE_COLOR.idle }} />
                    )
                }
                label={t("targetCloud")}
                value={hasCloud ? CLOUD_STATUS[connectionStatus] : t("targetCloudOff")}
                tone={cloudTone}
            />

            {!hasCloud && (canUploadToCloud || !isPro) && (
                <div className={navbar.target_actions}>
                    {canUploadToCloud ? (
                        <TargetAction
                            label={t("uploadToCloud")}
                            onClick={run(() => onUploadToCloud?.())}
                        />
                    ) : (
                        <TargetAction
                            label={isSignedIn ? t("cloudUpgrade") : t("cloudSignInUpgrade")}
                            onClick={upgrade}
                        />
                    )}
                </div>
            )}

            {extra}
        </>
    );
};

interface SaveTargetsProps {
    /** True when the project has a cloud room (i.e. the user is a member). */
    hasCloud: boolean;
    /** True when a local-only project could be promoted to the cloud. */
    canUploadToCloud?: boolean;
    onUploadToCloud?: () => void;
}

/**
 * Where this project is saved, in one readout: **on this device**, **to a file**,
 * **to the cloud**.
 *
 * It replaces the single connection dot because the dot answered only a third of
 * the question once files entered the picture — and the two silent targets are
 * the reassuring ones. Local is stated rather than reported: it is not a variable
 * (every project is a Yjs doc in IndexedDB), and leaving it out would make the
 * panel look like a list of things that can fail. The cloud half keeps its
 * existing states and wording untouched.
 *
 * One island, no second row: hovering (or tapping, on touch) opens the panel that
 * already showed cloud storage, now carrying the three targets and the file's
 * own actions.
 */
export const SaveTargets = ({ hasCloud, canUploadToCloud, onUploadToCloud }: SaveTargetsProps) => {
    const { connectionStatus } = useContext(ProjectContext);
    const projectId = useProjectIdFromUrl();
    const isTouch = useIsTouch();
    const [open, setOpen] = useState(false);
    const t = useTranslations("navbar");

    const fileStatus = useFileBindingStatus(projectId);
    const fileNeedsAttention = fileStatus.state === "missing" || fileStatus.state === "error";

    // Hover on pointer devices, tap on touch — where a hover panel would either
    // never open or never close.
    //
    // Closing is deferred by a beat so overshooting the panel's edge on the way
    // to a button doesn't dismiss it outright. The panel holds actions now (one
    // of them destructive), so having to re-open and re-aim after a slightly
    // wide arc would be its own small punishment. The gap between the trigger
    // and the panel is bridged in CSS — see `.save_targets::after`.
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelClose = () => {
        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    };
    useEffect(
        () => () => {
            if (closeTimer.current) clearTimeout(closeTimer.current);
        },
        [],
    );

    const hoverProps = isTouch
        ? {}
        : {
              onMouseEnter: () => {
                  cancelClose();
                  setOpen(true);
              },
              onMouseLeave: () => {
                  cancelClose();
                  closeTimer.current = setTimeout(() => setOpen(false), 250);
              },
          };

    // Acknowledge an explicit ⌘S. A bound project that was already current shows
    // the same "saved" glyph before and after the keystroke, so without this the
    // shortcut looks broken exactly when everything is fine. The store expires it
    // on its own, so this is plain derived state.
    const manual = projectId ? getManualSave(projectId) : null;

    /**
     * One glyph, not three — and always the glyph of whatever the user most needs
     * to know about.
     *
     * Ambiently they need a single answer, is my work safe, and three icons made
     * them assemble it from parts every time to reach a conclusion that is almost
     * always "yes". The breakdown belongs in the panel, where it is asked for.
     *
     * Which icon, highest priority first:
     *  · **something is wrong → that half's own icon says so.** A broken file
     *    binding shows the disk, in warning colour and pulsing; a cloud project
     *    that is offline or reconnecting shows the connection, exactly as it
     *    always has. Never a generic alert triangle standing in for both — the
     *    icon that names the problem is the one worth showing.
     *  · **cloud-synced and connected → the green connection icon**, unchanged.
     *  · **otherwise → a green save icon.** Everything is saved and there is
     *    nothing to chase, which is the state this thing is in nearly all the
     *    time. Deliberately a plain "saved" symbol rather than any one target's
     *    icon: reusing the file target's glyph here would read as a claim about
     *    the file specifically, when the point is that all of them are fine.
     *
     * The file half is checked before the cloud half because it is the only one
     * that fails *silently*: an offline cloud reconnects on its own, a file whose
     * path has gone stays gone until someone acts.
     *
     * Deliberately absent: the saving spinner. A pulse every three seconds while
     * someone types is noise about something that is working.
     */
    const summaryGlyph = () => {
        if (fileNeedsAttention) {
            return (
                // A warning nobody looks at is not a warning. This sits in chrome
                // the user reads past all day, so it moves — and stops dead under
                // prefers-reduced-motion, where the colour and badge carry it.
                <span className={join(navbar.target_glyph, navbar.target_alert)}>
                    <FileText style={{ color: TONE_COLOR.warn }} className={navbar.status_icon} />
                    <TriangleAlert size={10} className={navbar.target_affix} />
                </span>
            );
        }

        if (hasCloud) {
            if (connectionStatus === "connecting") {
                return <WifiSync style={{ color: "var(--warning)" }} className={navbar.status_icon} />;
            }
            if (connectionStatus === "disconnected") {
                return <WifiOff style={{ color: "var(--error)" }} className={navbar.status_icon} />;
            }
            return <CircleCheckBig style={{ color: "var(--success)" }} className={navbar.status_icon} />;
        }

        // A local-only project that could be promoted keeps its call to action:
        // it is the only route to the cloud, and losing it to a status glyph
        // would take a feature away rather than tidy one up.
        if (canUploadToCloud) {
            return (
                <div
                    className={navbar.tooltip}
                    data-hint={t("uploadToCloud")}
                    onClick={onUploadToCloud}
                    style={{ cursor: "pointer" }}
                >
                    <CloudUpload style={{ color: "var(--primary-text)" }} className={navbar.status_icon} />
                </div>
            );
        }

        // No tooltip: the hover panel already opens on this glyph and says where
        // the project lives in full, so a "Local project" hint would only be a
        // shorter answer to the same question — drawn at the same 40px offset,
        // on top of the panel giving the longer one.
        return <Save style={{ color: "var(--success)" }} className={navbar.status_icon} />;
    };

    return (
        <div className={navbar.status_wrapper} {...hoverProps}>
            <div
                className={navbar.save_targets}
                onClick={isTouch ? () => setOpen((v) => !v) : undefined}
            >
                {summaryGlyph()}
            </div>

            {manual && !open && (
                <div className={navbar.save_flash}>
                    {t("savedToFile", { file: fileNameOf(manual.path) })}
                </div>
            )}

            {open && projectId && (
                <div className={navbar.storage_panel}>
                    <SaveTargetsBody
                        projectId={projectId}
                        hasCloud={hasCloud}
                        canUploadToCloud={canUploadToCloud}
                        onUploadToCloud={onUploadToCloud}
                        extra={
                            hasCloud ? (
                                <>
                                    <div className={navbar.storage_separator} />
                                    <StorageUsageBody projectId={projectId} />
                                </>
                            ) : undefined
                        }
                    />
                </div>
            )}
        </div>
    );
};

/**
 * The same three-target readout, laid out for the phone menu drawer.
 *
 * The phone bar has no room for a hover panel and no pointer to open one with,
 * so the information moves into the menu the burger already opens. It is the
 * identical component — only the surface differs.
 */
export const MobileSaveTargets = ({
    projectId,
    hasCloud,
    canUploadToCloud,
    onUploadToCloud,
    onAction,
}: {
    projectId: string;
    hasCloud: boolean;
    canUploadToCloud?: boolean;
    onUploadToCloud?: () => void;
    /** Closes the drawer once an action has been taken. */
    onAction: () => void;
}) => (
    <SaveTargetsBody
        projectId={projectId}
        hasCloud={hasCloud}
        canUploadToCloud={canUploadToCloud}
        onUploadToCloud={onUploadToCloud}
        onAction={onAction}
    />
);

/**
 * Undo/redo pair for the editor being written in.
 *
 * Rendered in the phone bar's edit-mode cluster, and — on any touch device — in
 * the desktop bar too, because a tablet writing with the on-screen keyboard has
 * no other way to reach them. iPadOS's own undo affordances (the keyboard
 * shortcuts bar, the three-finger swipe) drive WebKit's undo stack, which this
 * history is not on: it is backed by the collaboration UndoManager, so only these
 * buttons and the Cmd+Z keybind reach it. A pointer device has that keybind and
 * so is left with a bar free of them.
 */
export const HistoryControls = ({
    editor,
    className,
}: {
    editor: Editor | null;
    className?: string;
}) => {
    const t = useTranslations("navbar");

    // Guard on the command existing so calling before Yjs is ready can't throw.
    const run = (action: "undo" | "redo") => {
        if (editor && typeof editor.commands[action] === "function") {
            editor.chain().focus()[action]().run();
        }
    };

    const button = (action: "undo" | "redo") => (
        <div
            className={join(navBtn.button, className ?? "")}
            // Swallow the compat mousedown so the tap can't blur the
            // contenteditable: on touch that would drop the on-screen keyboard
            // (and the format bar riding it) on every undo. Same guard the
            // keyboard toolbar uses — see [MobileFormatToolbar].
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(action)}
            aria-label={t(action)}
        >
            {action === "undo" ? <Undo2 size={18} /> : <Redo2 size={18} />}
        </div>
    );

    return (
        <>
            {button("undo")}
            {button("redo")}
        </>
    );
};

const getInitial = (name: string): string => {
    if (!name) return "?";
    return name.charAt(0).toUpperCase();
};

/** Stacked avatars of the project's collaborators (desktop only, hidden solo). */
export const CollaboratorsDisplay = () => {
    const { users } = useContext(ProjectContext);

    if (users.length <= 1) return null;

    const MAX_VISIBLE = 4;
    const visibleUsers = users.slice(0, MAX_VISIBLE);
    const remainingCount = users.length - MAX_VISIBLE;

    return (
        <div className={navbar.collaborators}>
            {visibleUsers.map((user, index) => (
                <div
                    key={index}
                    className={navbar.collaborator}
                    style={{ backgroundColor: user.color }}
                    data-hint={user.name}
                >
                    <span className={navbar.collaboratorInitial}>{getInitial(user.name)}</span>
                </div>
            ))}
            {remainingCount > 0 && <div className={navbar.collaboratorMore}>+{remainingCount}</div>}
        </div>
    );
};
