"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ProjectContext } from "@src/context/ProjectContext";
import { UserContext } from "@src/context/UserContext";
import { useViewContext } from "@src/context/ViewContext";
import { BoardCardData, MAIN_SCREENPLAY_REF, TimelineClip, TimelineLayer } from "@src/lib/project/project-state";
import { TransientScene } from "@src/lib/screenplay/scenes";
import { focusOnPosition } from "@src/lib/screenplay/editor";
import { join } from "@src/lib/utils/misc";
import { ContextMenuItem } from "@components/utils/ContextMenu";
import {
    ChevronDown,
    ChevronRight,
    Clock,
    Film,
    Pencil,
    Plus,
    Trash2,
    Unlink,
    X,
    ZoomIn,
    ZoomOut,
} from "lucide-react";

import styles from "./TimelinePanel.module.css";

/** Live-resolved display data for a clip. */
type ResolvedClip = {
    title: string;
    preview: string;
    color?: string;
    /** True when the referenced source element no longer exists. */
    missing: boolean;
    /** Editor position of a resolved scene (for navigation). */
    position?: number;
};

// Layout constants.
const TRACK_H = 46; // height of one layer lane, px
const LABEL_W = 150; // width of the left name column, px
const RULER_H = 26; // height of the bottom minute ruler, px
const SCENE_LINE_H = 52; // height of the read-only scene overview band, px
const TOOLBAR_H = 44; // height of the top toolbar, px
const SCROLLBAR_H = 16; // height of the custom horizontal scrollbar strip (.hscroll)
const INDENT = 14; // left inset per nesting level in the label column, px

// Clip starts/widths snap to eighths of a minute (7.5s) for fine placement.
const EIGHTH = 1 / 8; // minutes per snap step
const MIN_DURATION = EIGHTH; // shortest clip
const SNAP = EIGHTH; // snap starts/widths to the eighth grid

// Zoom levels expressed as minutes of runtime visible across the panel width.
// pixels-per-minute is derived from the measured panel width (below), so a given
// slider position shows the same span regardless of screen size.
const ZOOM_MINUTES = [120, 85, 60, 42, 30, 22, 16, 11, 7.5, 5];
const DEFAULT_ZOOM_INDEX = 6; // ~16 minutes visible by default
// Assumed panel width until it's actually measured (avoids a 0-width first paint).
const FALLBACK_PANEL_WIDTH = 1000;

const DEFAULT_FEATURE_LENGTH = 90; // minutes, mirrors the repository default

const PREVIEW_MAX = 80;

const truncate = (text: string) => {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > PREVIEW_MAX ? clean.slice(0, PREVIEW_MAX).trimEnd() + "…" : clean;
};

const parseCards = (raw: unknown): BoardCardData[] => {
    if (!raw) return [];
    try {
        return typeof raw === "string" ? (JSON.parse(raw) as BoardCardData[]) : (raw as BoardCardData[]);
    } catch {
        return [];
    }
};

const snap = (v: number) => Math.round(v / SNAP) * SNAP;

// Suppress text selection (e.g. layer names) for the duration of a pointer drag.
const lockSelection = () => {
    document.body.style.userSelect = "none";
    document.body.style.setProperty("-webkit-user-select", "none");
};
const unlockSelection = () => {
    document.body.style.userSelect = "";
    document.body.style.removeProperty("-webkit-user-select");
};

// Magnetic snap tolerance to other clips' edges, in pixels.
const SNAP_PX = 7;

/** Nearest candidate to `value` within `tol` minutes, or null if none is close. */
const nearestCandidate = (value: number, candidates: number[], tol: number): number | null => {
    let best: number | null = null;
    let bestDist = tol;
    for (const c of candidates) {
        const dist = Math.abs(c - value);
        if (dist <= bestDist) {
            bestDist = dist;
            best = c;
        }
    }
    return best;
};

/** Ruler tick label in minutes, rolling up to hours past 60. */
const formatTick = (m: number) => {
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}h${r}` : `${h}h`;
};

/** Clip duration readout as `m:ss` of screen time. */
const formatDuration = (minutes: number) => {
    const secs = Math.round(minutes * 60);
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    return `${mm}:${ss.toString().padStart(2, "0")}`;
};

/** Where a dragged layer would land relative to the layer it's dropped on. */
type LayerDropPos = "before" | "into" | "after";

/** In-flight drag: a live placement preview committed to Yjs on pointer up. */
type DragState = {
    clip: TimelineClip;
    mode: "move" | "resize-l" | "resize-r";
    startX: number;
    startY: number;
    origStart: number;
    origDuration: number;
    moved: boolean;
    /** Edges (starts + ends, minutes) of every other clip, for magnetic snapping. */
    snapCandidates: number[];
};

/** Other clips sharing a layer, sorted by start — the obstacles a drag/resize
 *  must not overlap. */
const sameLayerClips = (clips: Record<string, TimelineClip>, layerId: string, excludeId: string) =>
    Object.values(clips)
        .filter((c) => c.layerId === layerId && c.id !== excludeId)
        .sort((a, b) => a.start - b.start);

/** Nearest start to `desired` for a clip of `dur` that fits a free gap between
 *  `others` (so two clips on one layer never overlap). */
const fitStart = (others: TimelineClip[], dur: number, desired: number): number => {
    const gaps: [number, number][] = [];
    let cursor = 0;
    for (const o of others) {
        if (o.start > cursor) gaps.push([cursor, o.start]);
        cursor = Math.max(cursor, o.start + o.duration);
    }
    gaps.push([cursor, Infinity]); // trailing gap always fits
    let best = Math.max(0, desired);
    let bestDist = Infinity;
    for (const [lo, hi] of gaps) {
        if (hi - lo < dur - 1e-9) continue;
        const s = Math.max(lo, Math.min(desired, hi - dur));
        const dist = Math.abs(s - desired);
        if (dist < bestDist) {
            bestDist = dist;
            best = s;
        }
    }
    return best;
};

const TimelinePanel = () => {
    const t = useTranslations("timeline");
    const {
        repository,
        timelineLayers,
        timelineClips,
        scenes,
        editor,
    } = useContext(ProjectContext);
    const { focusedSide, setSidePanel, setFocusedSide, setTimelineOpen } = useViewContext();
    const { updateContextMenu } = useContext(UserContext);
    const projectState = repository?.getState();

    const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
    // Visible width of the track area (panel minus the sticky label column). Each
    // zoom level fits a fixed number of minutes into it.
    const [trackViewportW, setTrackViewportW] = useState(0);
    const pxPerMin = (trackViewportW > 0 ? trackViewportW : FALLBACK_PANEL_WIDTH) / ZOOM_MINUTES[zoomIndex];

    // Playhead position in minutes (null until the user picks a spot on the ruler
    // or an empty part of a track).
    const [playhead, setPlayhead] = useState<number | null>(null);

    // Feature length (minutes) lives in project metadata so it persists and syncs.
    const [featureLength, setFeatureLength] = useState(
        () => repository?.getFeatureLength() ?? DEFAULT_FEATURE_LENGTH,
    );
    const [lengthEditorOpen, setLengthEditorOpen] = useState(false);
    const lengthAnchorRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!repository) return;
        setFeatureLength(repository.getFeatureLength());
        return repository.observeMetadata((meta) => {
            if (meta.featureLength !== undefined) setFeatureLength(meta.featureLength);
        });
    }, [repository]);
    useEffect(() => {
        if (!lengthEditorOpen) return;
        const onDown = (e: MouseEvent) => {
            if (lengthAnchorRef.current && !lengthAnchorRef.current.contains(e.target as Node)) {
                setLengthEditorOpen(false);
            }
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [lengthEditorOpen]);

    // Folded layers (local, like the document tree's expand state).
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    const toggleCollapse = useCallback((id: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Children of a layer (null = roots), sorted by fractional `order`.
    const childrenOf = useCallback(
        (parentId: string | null) =>
            Object.values(timelineLayers)
                .filter((l) => (l.parentId ?? null) === parentId)
                .sort((a, b) => a.order - b.order),
        [timelineLayers],
    );

    const appendOrder = useCallback(
        (parentId: string | null, excludeId?: string) => {
            const kids = childrenOf(parentId).filter((n) => n.id !== excludeId);
            return kids.length ? kids[kids.length - 1].order + 1 : 0;
        },
        [childrenOf],
    );

    /** Flattened, depth-annotated lanes in display order, skipping folded subtrees. */
    const visibleLayers = useMemo(() => {
        const out: { layer: TimelineLayer; depth: number; hasChildren: boolean }[] = [];
        const walk = (parentId: string | null, depth: number) => {
            for (const layer of childrenOf(parentId)) {
                const kids = childrenOf(layer.id);
                out.push({ layer, depth, hasChildren: kids.length > 0 });
                if (kids.length && !collapsed.has(layer.id)) walk(layer.id, depth + 1);
            }
        };
        walk(null, 0);
        return out;
    }, [childrenOf, collapsed]);

    // ---- Layer drag & drop (pointer-based; see onLayerPointerDown below) ----
    // Pointer-based rather than native HTML5 drag so the hover indicator repaints
    // reliably (WebKit does not repaint DOM changes made during a native drag).
    // Dropping over a lane's top/bottom quarter reorders it as a sibling; over the
    // middle nests it under the target.
    const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);

    // Inline rename: the layer whose name is being edited (via double-click or the
    // right-click menu). Its <span> swaps to an <input>, which the effect focuses.
    const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
    const editInputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        if (editingLayerId && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingLayerId]);

    const commitLayerMove = useCallback(
        (dragId: string, targetId: string, pos: LayerDropPos) => {
            const target = timelineLayers[targetId];
            if (!repository || !target || dragId === targetId) return;

            if (pos === "into") {
                repository.moveTimelineLayer(dragId, target.id, appendOrder(target.id, dragId));
                setCollapsed((c) => {
                    if (!c.has(target.id)) return c;
                    const next = new Set(c);
                    next.delete(target.id); // reveal the newly nested lane
                    return next;
                });
                return;
            }

            const parentId = target.parentId ?? null;
            const siblings = childrenOf(parentId).filter((n) => n.id !== dragId);
            const idx = siblings.findIndex((n) => n.id === targetId);
            let order: number;
            if (pos === "before") {
                const prev = siblings[idx - 1];
                order = prev ? (prev.order + target.order) / 2 : target.order - 1;
            } else {
                const next = siblings[idx + 1];
                order = next ? (target.order + next.order) / 2 : target.order + 1;
            }
            repository.moveTimelineLayer(dragId, parentId, order);
        },
        [timelineLayers, childrenOf, appendOrder, repository],
    );

    // Seed the two default lanes the first time the timeline is opened empty.
    const seededRef = useRef(false);
    useEffect(() => {
        if (seededRef.current || !repository) return;
        if (Object.keys(timelineLayers).length === 0) {
            seededRef.current = true;
            repository.ensureTimelineLayers(2, (i) => `${t("layer")} ${i + 1}`);
        }
    }, [repository, timelineLayers, t]);

    // ---- Live resolution of clip references (mirrors the old Outline resolver) ----

    const cardBoardIds = useMemo(
        () => [...new Set(Object.values(timelineClips).filter((c) => c.source === "card").map((c) => c.refDocId))],
        [timelineClips],
    );
    const editorDocIds = useMemo(
        () => [
            ...new Set(
                Object.values(timelineClips)
                    .filter((c) => c.source === "scene" && c.refDocId !== MAIN_SCREENPLAY_REF)
                    .map((c) => c.refDocId),
            ),
        ],
        [timelineClips],
    );

    const [sourceVersion, setSourceVersion] = useState(0);
    const cardKey = cardBoardIds.join(",");
    const editorKey = editorDocIds.join(",");
    useEffect(() => {
        if (!projectState) return;
        const bump = () => setSourceVersion((v) => v + 1);
        const unsubs: (() => void)[] = [];
        for (const id of cardBoardIds) {
            const map = projectState.boardData(id);
            map.observe(bump);
            unsubs.push(() => map.unobserve(bump));
        }
        for (const id of editorDocIds) {
            const frag = projectState.documentFragment(id);
            frag.observe(bump);
            unsubs.push(() => frag.unobserve(bump));
        }
        return () => unsubs.forEach((u) => u());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectState, cardKey, editorKey]);

    const resolved = useMemo<Record<string, ResolvedClip>>(() => {
        const out: Record<string, ResolvedClip> = {};
        const mainScenes = new Map(scenes.filter((s) => s.id).map((s) => [s.id as string, s]));

        const editorScenes = new Map<string, Map<string, TransientScene>>();
        for (const id of editorDocIds) {
            const list = repository?.getEditorDocumentScenes(id) ?? [];
            editorScenes.set(id, new Map(list.filter((s) => s.id).map((s) => [s.id as string, s])));
        }

        const boardCards = new Map<string, Map<string, BoardCardData>>();
        for (const id of cardBoardIds) {
            const cards = parseCards(projectState?.boardData(id).get("cards"));
            boardCards.set(id, new Map(cards.map((c) => [c.id, c])));
        }

        for (const clip of Object.values(timelineClips)) {
            if (clip.source === "card") {
                const card = boardCards.get(clip.refDocId)?.get(clip.refId);
                out[clip.id] = card
                    ? { title: card.title, preview: truncate(card.description), color: card.color, missing: false }
                    : { title: clip.title, preview: clip.preview, color: clip.color, missing: true };
            } else {
                const scene =
                    clip.refDocId === MAIN_SCREENPLAY_REF
                        ? mainScenes.get(clip.refId)
                        : editorScenes.get(clip.refDocId)?.get(clip.refId);
                if (scene) {
                    const synopsis = "synopsis" in scene ? (scene.synopsis as string | undefined) : undefined;
                    const color = "color" in scene ? (scene.color as string | undefined) : undefined;
                    out[clip.id] = {
                        title: scene.title,
                        preview: truncate(synopsis || scene.preview),
                        color,
                        missing: false,
                        position: scene.position,
                    };
                } else {
                    out[clip.id] = { title: clip.title, preview: clip.preview, color: clip.color, missing: true };
                }
            }
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timelineClips, scenes, sourceVersion, cardKey, editorKey, repository, projectState]);

    // Keep each clip's cached snapshot fresh so the "unlinked" fallback shows the
    // last-known title/preview/color.
    useEffect(() => {
        if (!repository) return;
        for (const clip of Object.values(timelineClips)) {
            const r = resolved[clip.id];
            if (!r || r.missing) continue;
            if (
                r.title !== clip.title ||
                r.preview !== clip.preview ||
                (r.color ?? undefined) !== (clip.color ?? undefined)
            ) {
                repository.refreshTimelineClipSnapshot(clip.id, { title: r.title, preview: r.preview, color: r.color });
            }
        }
    }, [repository, timelineClips, resolved]);

    // ---- Navigation ----

    // Latest screenplay editor, read lazily so a deferred focus (after the
    // screenplay panel mounts) never uses a stale/null instance.
    const editorRef = useRef(editor);
    editorRef.current = editor;

    // Clicking the timeline scrolls the screenplay editor to the page matching
    // the clicked time — one minute of screen time ≈ one script page. It brings
    // the screenplay into view first (but never opens boards).
    const navigate = useCallback(
        (minutes: number) => {
            setSidePanel(focusedSide, "screenplay");
            setFocusedSide(focusedSide);

            const page = Math.max(1, Math.round(minutes)); // 1 min ≈ 1 page

            // The screenplay editor may still be mounting after setSidePanel;
            // retry briefly until it's available.
            const focus = (attempt: number) => {
                const ed = editorRef.current;
                if (!ed) {
                    if (attempt < 12) window.setTimeout(() => focus(attempt + 1), 40);
                    return;
                }
                // Each page's first node carries a pagination start class, one per
                // page in document order — so the Nth marks the top of page N.
                const starts = ed.view.dom.querySelectorAll(
                    ".pagination-doc-start, .pagination-break-start",
                );
                if (starts.length > 0) {
                    const el = starts[Math.min(starts.length - 1, page - 1)];
                    const pos = ed.view.posAtDOM(el, 0);
                    if (pos >= 0) {
                        focusOnPosition(ed, pos);
                        return;
                    }
                }
                // Fallback (pagination markers absent): proportional content scroll.
                const size = ed.state.doc.content.size;
                const fraction = featureLength > 0 ? Math.min(1, Math.max(0, minutes / featureLength)) : 0;
                focusOnPosition(ed, Math.max(1, Math.min(size - 1, Math.round(fraction * size))));
            };
            focus(0);
        },
        [focusedSide, setSidePanel, setFocusedSide, featureLength],
    );

    // ---- Timeline extent + ruler ----

    const maxEnd = useMemo(() => {
        let end = 0;
        for (const c of Object.values(timelineClips)) end = Math.max(end, c.start + c.duration);
        return end;
    }, [timelineClips]);

    // Ticks spaced so labels never crowd (aim for >= 48px per major tick).
    const tickStep = useMemo(() => {
        const candidates = [1, 2, 5, 10, 15, 30, 60, 120];
        return candidates.find((s) => s * pxPerMin >= 48) ?? 120;
    }, [pxPerMin]);

    // Span the whole feature, but always keep every clip in view.
    const totalMinutes = useMemo(() => {
        const min = Math.max(30, featureLength, Math.ceil(maxEnd) + 2);
        return Math.ceil(min / tickStep) * tickStep;
    }, [maxEnd, featureLength, tickStep]);

    const trackWidth = totalMinutes * pxPerMin;

    const ticks = useMemo(() => {
        const out: number[] = [];
        for (let m = 0; m <= totalMinutes; m += tickStep) out.push(m);
        return out;
    }, [totalMinutes, tickStep]);

    // Faint eighth-of-a-page gridlines, shown once an eighth is wide enough.
    const eighthTicks = useMemo(() => {
        if (EIGHTH * pxPerMin < 7) return [];
        const out: number[] = [];
        for (let m = 0; m <= totalMinutes + 1e-6; m += EIGHTH) out.push(m);
        return out;
    }, [totalMinutes, pxPerMin]);

    // ---- Scene overview line ----
    // A read-only band above the tracks showing every scene currently in the
    // screenplay, laid out proportionally to its length across the feature
    // runtime (1 page ≈ 1 minute). `scenes` comes from the ProjectContext, which
    // recomputes them on the debounced screenplay callback — so this reflects the
    // settled scene list, not every keystroke. Purely informative: no drag/edit.
    const sceneSegments = useMemo(() => {
        const items = scenes.filter((s) => s.nextPosition > s.position);
        if (items.length === 0) return [];
        const origin = items[0].position;
        const total = items[items.length - 1].nextPosition - origin;
        if (total <= 0) return [];
        const spanWidth = featureLength * pxPerMin;
        return items.map((s, i) => {
            const left = ((s.position - origin) / total) * spanWidth;
            const right = ((s.nextPosition - origin) / total) * spanWidth;
            return {
                key: s.id ?? `scene-${i}`,
                title: s.title || t("untitled"),
                color: s.color,
                left,
                // Leave a 2px seam between neighbours so adjacent scenes read as
                // distinct blocks rather than one continuous bar.
                width: Math.max(2, right - left - 2),
            };
        });
    }, [scenes, featureLength, pxPerMin, t]);

    // ---- Ruler sync ----
    // The ruler lives outside the vertically-scrolling tracks area so it stays
    // fixed while layers scroll. It follows the tracks' horizontal scroll via a
    // transform so the two stay aligned.
    const tracksScrollRef = useRef<HTMLDivElement>(null);
    const rulerRef = useRef<HTMLDivElement>(null);
    const sceneLineRef = useRef<HTMLDivElement>(null);

    // Custom horizontal scrollbar geometry (fraction of the content in view and
    // the current scroll offset, both 0..1). Native macOS overlay scrollbars
    // hide themselves and take no space, so we render our own bar instead.
    const hTrackRef = useRef<HTMLDivElement>(null);
    const [hbar, setHbar] = useState({ left: 0, ratio: 1 });
    const updateHbar = useCallback(() => {
        const el = tracksScrollRef.current;
        if (!el) return;
        const { scrollLeft, clientWidth, scrollWidth } = el;
        setHbar({
            left: scrollWidth > 0 ? scrollLeft / scrollWidth : 0,
            ratio: scrollWidth > 0 ? Math.min(1, clientWidth / scrollWidth) : 1,
        });
    }, []);

    const syncRuler = useCallback(() => {
        if (tracksScrollRef.current) {
            const offset = `translateX(${-tracksScrollRef.current.scrollLeft}px)`;
            if (rulerRef.current) rulerRef.current.style.transform = offset;
            if (sceneLineRef.current) sceneLineRef.current.style.transform = offset;
        }
        updateHbar();
    }, [updateHbar]);
    // Re-align after zoom changes the track width.
    useEffect(syncRuler, [syncRuler, trackWidth]);
    // Track the panel's visible track width (drives pixels-per-minute) and keep
    // the scrollbar sized as it resizes.
    useEffect(() => {
        const el = tracksScrollRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => {
            setTrackViewportW(el.clientWidth - LABEL_W);
            updateHbar();
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [updateHbar]);

    // Drag the custom scrollbar thumb to scroll the tracks horizontally.
    const onHThumbPointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const el = tracksScrollRef.current;
        const track = hTrackRef.current;
        if (!el || !track) return;
        const startX = e.clientX;
        const startLeft = el.scrollLeft;
        const range = el.scrollWidth - el.clientWidth; // scrollable px
        const thumbTravel = track.clientWidth * (1 - Math.min(1, el.clientWidth / el.scrollWidth));
        const onMove = (ev: PointerEvent) => {
            if (thumbTravel <= 0) return;
            el.scrollLeft = startLeft + ((ev.clientX - startX) * range) / thumbTravel;
        };
        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    }, []);

    // Move the playhead to the time under a click on the ruler or an empty track,
    // and scroll the screenplay to the approximate matching spot.
    const setPlayheadFromClientX = useCallback(
        (clientX: number) => {
            const el = tracksScrollRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const x = clientX - rect.left - LABEL_W + el.scrollLeft;
            const minutes = Math.max(0, Math.min(totalMinutes, x / pxPerMin));
            setPlayhead(minutes);
            navigate(minutes);
        },
        [totalMinutes, pxPerMin, navigate],
    );

    // ---- Drag & resize ----

    const tracksRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    // Live placement of the clip being dragged; committed to Yjs on pointer up.
    // Mirrored in a ref so the pointer-up commit never reads a stale (one move
    // behind) value from React state.
    // A drag previews one clip (move / plain resize) or two (a roll edit on a
    // shared border, where both adjacent clips update together).
    type Placement = Pick<TimelineClip, "id" | "layerId" | "start" | "duration">;
    const [preview, setPreviewState] = useState<Placement[] | null>(null);
    const previewRef = useRef<Placement[] | null>(null);
    const setPreview = useCallback((p: Placement[] | null) => {
        previewRef.current = p;
        setPreviewState(p);
    }, []);

    const layerAtY = useCallback(
        (clientY: number): string => {
            const el = tracksRef.current;
            if (!el || visibleLayers.length === 0) return visibleLayers[0]?.layer.id ?? "";
            const rect = el.getBoundingClientRect();
            const i = Math.floor((clientY - rect.top) / TRACK_H);
            const clamped = Math.max(0, Math.min(visibleLayers.length - 1, i));
            return visibleLayers[clamped].layer.id;
        },
        [visibleLayers],
    );

    // Window listeners for the active clip drag. Stored so an unmount mid-drag
    // can detach them.
    const clipDragListenersRef = useRef<{
        move: (e: PointerEvent) => void;
        up: (e: PointerEvent) => void;
        cancel: (e: PointerEvent) => void;
    } | null>(null);

    const onClipPointerDown = useCallback(
        (e: React.PointerEvent, clip: TimelineClip, mode: DragState["mode"]) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            // Snap targets: the origin plus every other clip's start and end, so
            // edges line up with clips on any layer.
            const candidates = new Set<number>([0]);
            for (const c of Object.values(timelineClips)) {
                if (c.id === clip.id) continue;
                candidates.add(c.start);
                candidates.add(c.start + c.duration);
            }
            lockSelection();
            dragRef.current = {
                clip,
                mode,
                startX: e.clientX,
                startY: e.clientY,
                origStart: clip.start,
                origDuration: clip.duration,
                moved: false,
                snapCandidates: [...candidates],
            };
            setPreview([{ id: clip.id, layerId: clip.layerId, start: clip.start, duration: clip.duration }]);

            // Drive the drag from window listeners rather than the clip element +
            // pointer capture: when the clip re-parents to another layer's track
            // mid-drag, an element-scoped capture is lost and pointerup never
            // fires, leaving the clip "stuck" to the cursor. Window listeners are
            // immune to that re-parenting.
            const onMove = (ev: PointerEvent) => {
                const d = dragRef.current;
                if (!d) return;
                const dxMin = (ev.clientX - d.startX) / pxPerMin;
                // Slightly forgiving threshold so a trackpad click (which can
                // jitter a few px) still counts as a tap, not a drag.
                if (!d.moved && (Math.abs(ev.clientX - d.startX) > 6 || Math.abs(ev.clientY - d.startY) > 6)) {
                    d.moved = true;
                }
                const tol = SNAP_PX / pxPerMin;
                const cands = d.snapCandidates;

                if (d.mode === "move") {
                    const rawStart = Math.max(0, d.origStart + dxMin);
                    const rawEnd = rawStart + d.origDuration;
                    const snapStart = nearestCandidate(rawStart, cands, tol);
                    const snapEnd = nearestCandidate(rawEnd, cands, tol);
                    let start: number;
                    if (snapStart !== null && (snapEnd === null || Math.abs(snapStart - rawStart) <= Math.abs(snapEnd - rawEnd))) {
                        start = snapStart;
                    } else if (snapEnd !== null) {
                        start = snapEnd - d.origDuration;
                    } else {
                        start = snap(rawStart);
                    }
                    start = Math.max(0, start);
                    // Keep the clip inside a free gap on the target layer so two
                    // clips of the same layer never overlap.
                    const targetLayer = layerAtY(ev.clientY);
                    start = fitStart(sameLayerClips(timelineClips, targetLayer, d.clip.id), d.origDuration, start);
                    setPreview([{ id: d.clip.id, layerId: targetLayer, start, duration: d.origDuration }]);
                } else if (d.mode === "resize-r") {
                    const others = sameLayerClips(timelineClips, d.clip.layerId, d.clip.id);
                    const origEnd = d.origStart + d.origDuration;
                    const rawEnd = d.origStart + Math.max(MIN_DURATION, d.origDuration + dxMin);
                    const snapEnd = nearestCandidate(rawEnd, cands, tol);
                    let border = snapEnd !== null ? snapEnd : d.origStart + snap(rawEnd - d.origStart);
                    // If a clip is flush against this border, roll it: move both edges.
                    const neighbor = others.find((o) => Math.abs(o.start - origEnd) < 1e-6);
                    if (neighbor) {
                        const nEnd = neighbor.start + neighbor.duration;
                        border = Math.max(d.origStart + MIN_DURATION, Math.min(nEnd - MIN_DURATION, border));
                        setPreview([
                            { id: d.clip.id, layerId: d.clip.layerId, start: d.origStart, duration: border - d.origStart },
                            { id: neighbor.id, layerId: neighbor.layerId, start: border, duration: nEnd - border },
                        ]);
                    } else {
                        const rightLimit = others.reduce((m, o) => (o.start >= d.origStart ? Math.min(m, o.start) : m), Infinity);
                        border = Math.min(border, rightLimit);
                        const duration = Math.max(MIN_DURATION, border - d.origStart);
                        setPreview([{ id: d.clip.id, layerId: d.clip.layerId, start: d.origStart, duration }]);
                    }
                } else {
                    const others = sameLayerClips(timelineClips, d.clip.layerId, d.clip.id);
                    const origEnd = d.origStart + d.origDuration;
                    const maxStart = origEnd - MIN_DURATION;
                    const rawStart = Math.min(maxStart, Math.max(0, d.origStart + dxMin));
                    const snapStart = nearestCandidate(rawStart, cands, tol);
                    let border = Math.min(maxStart, Math.max(0, snapStart !== null ? snapStart : snap(rawStart)));
                    // If a clip is flush against this border, roll it: move both edges.
                    const neighbor = others.find((o) => Math.abs(o.start + o.duration - d.origStart) < 1e-6);
                    if (neighbor) {
                        border = Math.max(neighbor.start + MIN_DURATION, Math.min(maxStart, border));
                        setPreview([
                            { id: neighbor.id, layerId: neighbor.layerId, start: neighbor.start, duration: border - neighbor.start },
                            { id: d.clip.id, layerId: d.clip.layerId, start: border, duration: origEnd - border },
                        ]);
                    } else {
                        const leftLimit = others.reduce((m, o) => {
                            const oe = o.start + o.duration;
                            return oe <= d.origStart ? Math.max(m, oe) : m;
                        }, 0);
                        border = Math.max(border, leftLimit);
                        setPreview([{ id: d.clip.id, layerId: d.clip.layerId, start: border, duration: origEnd - border }]);
                    }
                }
            };
            const detach = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onCancel);
                clipDragListenersRef.current = null;
                unlockSelection();
            };
            const onUp = () => {
                detach();
                const d = dragRef.current;
                dragRef.current = null;
                const p = previewRef.current;
                setPreview(null);
                if (!d) return;
                // A tap with no movement drops the playhead on the clip and
                // scrolls the screenplay to the matching spot.
                if (!d.moved) {
                    setPlayhead(d.clip.start);
                    navigate(d.clip.start);
                    return;
                }
                if (!p || !repository) return;
                for (const placement of p) {
                    const orig = timelineClips[placement.id];
                    if (!orig) continue;
                    if (
                        placement.layerId !== orig.layerId ||
                        placement.start !== orig.start ||
                        placement.duration !== orig.duration
                    ) {
                        repository.updateTimelineClip(placement.id, {
                            layerId: placement.layerId,
                            start: placement.start,
                            duration: placement.duration,
                        });
                    }
                }
            };
            // A cancelled pointer stream (e.g. a trackpad gesture) aborts the drag
            // without committing, so the clip never gets stuck to the cursor.
            const onCancel = () => {
                detach();
                dragRef.current = null;
                setPreview(null);
            };
            clipDragListenersRef.current = { move: onMove, up: onUp, cancel: onCancel };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onCancel);
        },
        [pxPerMin, layerAtY, setPreview, repository, navigate, timelineClips],
    );

    // Detach an in-progress clip drag if the panel unmounts.
    useEffect(() => {
        return () => {
            const l = clipDragListenersRef.current;
            if (l) {
                window.removeEventListener("pointermove", l.move);
                window.removeEventListener("pointerup", l.up);
                window.removeEventListener("pointercancel", l.cancel);
                unlockSelection();
            }
        };
    }, []);

    // ---- Layer drag (pointer-based) ----

    const layerDragIdRef = useRef<string | null>(null);
    const layerDropRef = useRef<{ id: string; pos: LayerDropPos } | null>(null);
    const layerDragListenersRef = useRef<{
        move: (e: PointerEvent) => void;
        up: (e: PointerEvent) => void;
        cancel: (e: PointerEvent) => void;
    } | null>(null);

    // The hovered drop target (which lane, and before/into/after) drives the
    // highlight declaratively — each row renders its own data-drop from this
    // state. A pointer-based drag (not native HTML5 DnD) repaints on state
    // change just fine.
    const [dropTarget, setDropTarget] = useState<{ id: string; pos: LayerDropPos } | null>(null);

    // Whole label acts as the drag handle: press and move past a small threshold
    // to reorder/nest a lane. Below the threshold a press is a plain click (or
    // double-click to rename), so no visible grip is needed. Skipped while the
    // lane's name is being edited so the caret can be placed in the input.
    const onLayerPointerDown = useCallback(
        (e: React.PointerEvent, layer: TimelineLayer) => {
            if (e.button !== 0 || editingLayerId === layer.id) return;
            const startX = e.clientX;
            const startY = e.clientY;
            let activated = false;
            layerDragIdRef.current = layer.id;
            layerDropRef.current = null;

            // Which lane (and where within it) is under the pointer.
            const targetAtY = (clientY: number): { id: string; pos: LayerDropPos } | null => {
                const el = tracksRef.current;
                if (!el || visibleLayers.length === 0) return null;
                const rect = el.getBoundingClientRect();
                let i = Math.floor((clientY - rect.top) / TRACK_H);
                i = Math.max(0, Math.min(visibleLayers.length - 1, i));
                const target = visibleLayers[i].layer;
                if (target.id === layerDragIdRef.current) return null;
                const within = clientY - rect.top - i * TRACK_H;
                const pos: LayerDropPos =
                    within < TRACK_H * 0.25 ? "before" : within > TRACK_H * 0.75 ? "after" : "into";
                return { id: target.id, pos };
            };

            const activate = () => {
                activated = true;
                lockSelection();
                setDraggingLayerId(layer.id);
                setDropTarget(null);
            };
            const detach = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onCancel);
                layerDragListenersRef.current = null;
                if (activated) {
                    setDropTarget(null);
                    unlockSelection();
                }
            };
            const onMove = (ev: PointerEvent) => {
                if (!activated) {
                    // Wait for a deliberate drag before hijacking the press.
                    if (Math.abs(ev.clientX - startX) <= 6 && Math.abs(ev.clientY - startY) <= 6) return;
                    activate();
                }
                const target = targetAtY(ev.clientY);
                layerDropRef.current = target;
                setDropTarget(target);
            };
            const onUp = () => {
                detach();
                const dragId = layerDragIdRef.current;
                const drop = layerDropRef.current;
                layerDragIdRef.current = null;
                layerDropRef.current = null;
                if (!activated) return; // a plain click: nothing to commit
                setDraggingLayerId(null);
                if (dragId && drop) commitLayerMove(dragId, drop.id, drop.pos);
            };
            const onCancel = () => {
                detach();
                layerDragIdRef.current = null;
                layerDropRef.current = null;
                if (activated) setDraggingLayerId(null);
            };
            layerDragListenersRef.current = { move: onMove, up: onUp, cancel: onCancel };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onCancel);
        },
        [visibleLayers, commitLayerMove, editingLayerId],
    );

    useEffect(() => {
        return () => {
            const l = layerDragListenersRef.current;
            if (l) {
                window.removeEventListener("pointermove", l.move);
                window.removeEventListener("pointerup", l.up);
                window.removeEventListener("pointercancel", l.cancel);
                unlockSelection();
            }
        };
    }, []);

    // ---- Layer + clip mutations ----

    const addLayer = useCallback(() => {
        repository?.addTimelineLayer(`${t("layer")} ${Object.keys(timelineLayers).length + 1}`);
    }, [repository, timelineLayers, t]);

    const renameLayer = useCallback(
        (id: string, name: string) => repository?.renameTimelineLayer(id, name),
        [repository],
    );

    const deleteLayer = useCallback((id: string) => repository?.deleteTimelineLayer(id), [repository]);

    const removeClip = useCallback((id: string) => repository?.deleteTimelineClip(id), [repository]);

    // ---- Right-click menus (shared context-menu host) ----

    const openLayerMenu = useCallback(
        (e: React.MouseEvent, layer: TimelineLayer) => {
            e.preventDefault();
            e.stopPropagation();
            updateContextMenu({
                position: {
                    x: Math.min(e.clientX, window.innerWidth - 230),
                    y: Math.min(e.clientY, window.innerHeight - 160),
                },
                content: (
                    <>
                        <ContextMenuItem
                            text={t("renameLayer")}
                            icon={Pencil}
                            action={() => setEditingLayerId(layer.id)}
                        />
                        <ContextMenuItem text={t("deleteLayer")} icon={Trash2} action={() => deleteLayer(layer.id)} />
                    </>
                ),
            });
        },
        [updateContextMenu, t, deleteLayer],
    );

    const openClipMenu = useCallback(
        (e: React.MouseEvent, clip: TimelineClip) => {
            e.preventDefault();
            e.stopPropagation();
            updateContextMenu({
                position: {
                    x: Math.min(e.clientX, window.innerWidth - 230),
                    y: Math.min(e.clientY, window.innerHeight - 120),
                },
                content: (
                    <ContextMenuItem text={t("removeClip")} icon={Trash2} action={() => removeClip(clip.id)} />
                ),
            });
        },
        [updateContextMenu, t, removeClip],
    );

    const isEmpty = Object.keys(timelineClips).length === 0;

    return (
        <div
            className={styles.timeline}
            style={{
                height: TOOLBAR_H + SCENE_LINE_H + visibleLayers.length * TRACK_H + RULER_H + SCROLLBAR_H,
            }}
        >
            {/* Toolbar */}
            <div className={styles.toolbar}>
                <span className={styles.toolbar_title}>{t("title")}</span>
                <div className={styles.toolbar_spacer} />

                {/* Feature length */}
                <div className={styles.length_anchor} ref={lengthAnchorRef}>
                    <button
                        className={styles.tool_btn}
                        onClick={() => setLengthEditorOpen((v) => !v)}
                        title={t("featureLength")}
                    >
                        <Clock size={14} />
                        <span className={styles.tool_btn_label}>{formatTick(featureLength)}</span>
                    </button>
                    {lengthEditorOpen && (
                        <div className={styles.length_popover}>
                            <label className={styles.length_label}>{t("featureLength")}</label>
                            <div className={styles.length_field}>
                                <input
                                    className={styles.length_input}
                                    type="number"
                                    min={1}
                                    max={600}
                                    value={featureLength}
                                    autoFocus
                                    onChange={(e) => {
                                        const v = Math.max(1, Math.min(600, Math.round(Number(e.target.value) || 0)));
                                        setFeatureLength(v);
                                        repository?.setFeatureLength(v);
                                    }}
                                />
                                <span className={styles.length_unit}>{t("unitMinutesShort")}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Scale slider */}
                <div className={styles.zoom} title={t("scale")}>
                    <ZoomOut size={14} className={styles.zoom_icon} />
                    <input
                        className={styles.zoom_slider}
                        type="range"
                        min={0}
                        max={ZOOM_MINUTES.length - 1}
                        step={1}
                        value={zoomIndex}
                        onChange={(e) => setZoomIndex(Number(e.target.value))}
                        aria-label={t("scale")}
                    />
                    <ZoomIn size={14} className={styles.zoom_icon} />
                </div>

                <button className={styles.tool_btn} onClick={addLayer} title={t("addLayer")}>
                    <Plus size={14} />
                    <span className={styles.tool_btn_label}>{t("addLayer")}</span>
                </button>
                <button className={styles.icon_btn} onClick={() => setTimelineOpen(false)} title={t("close")}>
                    <X size={16} />
                </button>
            </div>

            {/* Custom, always-present horizontal scrollbar (native overlay bars
                auto-hide and take no space, so the timeline could not be scrolled
                once zoomed past the container width). */}
            <div className={styles.hscroll}>
                <div className={styles.hscroll_corner} style={{ width: LABEL_W }} />
                <div ref={hTrackRef} className={styles.hscroll_track}>
                    <div
                        className={styles.hscroll_thumb}
                        style={{ left: `${hbar.left * 100}%`, width: `${hbar.ratio * 100}%` }}
                        onPointerDown={onHThumbPointerDown}
                    />
                </div>
            </div>

            {/* Layer tracks: scroll vertically (layers) and horizontally (time). */}
            <div ref={tracksScrollRef} className={styles.tracks_scroll} onScroll={syncRuler}>
                <div className={styles.grid} style={{ width: LABEL_W + trackWidth }}>
                    <div ref={tracksRef} className={styles.rows}>
                        {visibleLayers.map(({ layer, depth, hasChildren }) => {
                            return (
                                <div
                                    key={layer.id}
                                    data-layer-id={layer.id}
                                    data-drop={dropTarget?.id === layer.id ? dropTarget.pos : undefined}
                                    className={styles.row}
                                    style={{ height: TRACK_H }}
                                >
                                    <div
                                        className={join(
                                            styles.label,
                                            draggingLayerId === layer.id ? styles.label_dragging : "",
                                            editingLayerId === layer.id ? styles.label_editing : "",
                                        )}
                                        style={{ width: LABEL_W }}
                                        title={editingLayerId === layer.id ? undefined : t("dragLayer")}
                                        onPointerDown={(e) => onLayerPointerDown(e, layer)}
                                        onContextMenu={(e) => openLayerMenu(e, layer)}
                                    >
                                        <div className={styles.label_indent} style={{ width: depth * INDENT }} />
                                        {hasChildren ? (
                                            <button
                                                className={styles.fold_btn}
                                                onClick={() => toggleCollapse(layer.id)}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                title={collapsed.has(layer.id) ? t("expandLayer") : t("collapseLayer")}
                                            >
                                                {collapsed.has(layer.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                            </button>
                                        ) : (
                                            <span className={styles.fold_spacer} />
                                        )}
                                        {editingLayerId === layer.id ? (
                                            <input
                                                ref={editInputRef}
                                                className={styles.label_input}
                                                value={layer.name}
                                                placeholder={t("layerPlaceholder")}
                                                onChange={(e) => renameLayer(layer.id, e.target.value)}
                                                onBlur={() => setEditingLayerId(null)}
                                                onKeyDown={(e) => {
                                                    // Enter/Escape commit by dropping focus (→ onBlur).
                                                    if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                                                }}
                                            />
                                        ) : (
                                            <span
                                                className={styles.label_name}
                                                onDoubleClick={() => setEditingLayerId(layer.id)}
                                            >
                                                {layer.name || t("layerPlaceholder")}
                                            </span>
                                        )}
                                    </div>
                                    <div
                                        className={styles.track}
                                        style={{ width: trackWidth }}
                                        onPointerDown={(e) => setPlayheadFromClientX(e.clientX)}
                                    >
                                        {Object.values(timelineClips)
                                            .filter((c) => {
                                                const p = preview?.find((x) => x.id === c.id) ?? c;
                                                return p.layerId === layer.id;
                                            })
                                            .map((clip) => {
                                                const p = preview?.find((x) => x.id === clip.id) ?? clip;
                                                const r = resolved[clip.id] ?? {
                                                    title: clip.title,
                                                    preview: clip.preview,
                                                    color: clip.color,
                                                    missing: true,
                                                };
                                                const isCard = clip.source === "card";
                                                return (
                                                    <div
                                                        key={clip.id}
                                                        className={join(styles.clip, r.missing ? styles.clip_missing : "")}
                                                        style={
                                                            {
                                                                left: p.start * pxPerMin,
                                                                width: p.duration * pxPerMin,
                                                                "--card-color": r.color || "var(--tertiary)",
                                                            } as React.CSSProperties
                                                        }
                                                        onPointerDown={(e) => onClipPointerDown(e, clip, "move")}
                                                        onContextMenu={(e) => openClipMenu(e, clip)}
                                                    >
                                                        <div
                                                            className={join(styles.handle, styles.handle_l)}
                                                            onPointerDown={(e) => onClipPointerDown(e, clip, "resize-l")}
                                                        />
                                                        <div className={styles.clip_body}>
                                                            {!isCard && <Film size={12} className={styles.clip_icon} />}
                                                            <span className={styles.clip_title}>
                                                                {r.title || t("untitled")}
                                                            </span>
                                                            {r.missing && (
                                                                <Unlink
                                                                    size={11}
                                                                    className={styles.clip_unlinked}
                                                                    aria-label={t("unlinkedHint")}
                                                                />
                                                            )}
                                                            {p.duration * pxPerMin >= 52 && (
                                                                <span className={styles.clip_duration}>
                                                                    {formatDuration(p.duration)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div
                                                            className={join(styles.handle, styles.handle_r)}
                                                            onPointerDown={(e) => onClipPointerDown(e, clip, "resize-r")}
                                                        />
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            );
                        })}
                        {isEmpty && visibleLayers.length > 0 && (
                            <div className={styles.empty_hint} style={{ left: LABEL_W + 16 }}>
                                {t("empty")}
                            </div>
                        )}
                        {playhead !== null && (
                            <div className={styles.playhead} style={{ left: LABEL_W + playhead * pxPerMin }} />
                        )}
                    </div>
                </div>
            </div>

            {/* Scene overview line — a read-only band listing every scene in the
                screenplay, proportional to its length. Sits just above the minute
                ruler, following the tracks' horizontal scroll (via syncRuler) but
                never scrolling vertically with the layers. */}
            <div className={styles.scene_row} style={{ height: SCENE_LINE_H }}>
                <div className={styles.scene_corner} style={{ width: LABEL_W }}>
                    <span className={styles.scene_unit}>{t("scenes")}</span>
                </div>
                <div className={styles.scene_viewport}>
                    <div ref={sceneLineRef} className={styles.scene_line} style={{ width: trackWidth }}>
                        {sceneSegments.map((seg) => (
                            <div
                                key={seg.key}
                                className={styles.scene_seg}
                                style={
                                    {
                                        left: seg.left,
                                        width: seg.width,
                                        "--scene-color": seg.color || "var(--tertiary)",
                                    } as React.CSSProperties
                                }
                                title={seg.title}
                            >
                                <span className={styles.scene_seg_title}>{seg.title}</span>
                            </div>
                        ))}
                        {playhead !== null && (
                            <div className={styles.scene_playhead} style={{ left: playhead * pxPerMin }} />
                        )}
                    </div>
                </div>
            </div>

            {/* Fixed minute ruler — always visible; follows the tracks' horizontal
                scroll but never scrolls vertically with the layers. */}
            <div className={styles.ruler_row} style={{ height: RULER_H }}>
                <div className={styles.ruler_corner} style={{ width: LABEL_W }}>
                    <span className={styles.ruler_unit}>{t("unitMinutes")}</span>
                </div>
                <div
                    className={styles.ruler_viewport}
                    onPointerDown={(e) => setPlayheadFromClientX(e.clientX)}
                >
                    <div ref={rulerRef} className={styles.ruler} style={{ width: trackWidth }}>
                        {eighthTicks.map((m) => (
                            <div
                                key={`e${m.toFixed(3)}`}
                                className={styles.tick_eighth}
                                style={{ left: m * pxPerMin }}
                            />
                        ))}
                        {ticks.map((m) => (
                            <div key={m} className={styles.tick} style={{ left: m * pxPerMin }}>
                                <span className={styles.tick_label}>{formatTick(m)}</span>
                            </div>
                        ))}
                        {playhead !== null && (
                            <div className={styles.ruler_playhead} style={{ left: playhead * pxPerMin }} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TimelinePanel;
