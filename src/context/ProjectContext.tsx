"use client";

import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { Editor } from "@tiptap/react";
import { CharacterMap, mergeCharactersData } from "@src/lib/screenplay/characters";
import { LocationMap, mergeLocationsData } from "@src/lib/screenplay/locations";
import { mergeScenesData, PersistentSceneMap, Scene } from "@src/lib/screenplay/scenes";
import { PersistentPageMap } from "@src/lib/screenplay/page-locking";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { ProjectRole } from "@src/generated/client/browser";
import { useUser } from "@src/lib/utils/hooks";
import { getCloudToken } from "@src/lib/utils/requests";
import {
    CollaboratorInfo,
    ConnectionStatus,
    LayoutData,
    ProductionData,
    useProjectYjs,
    ElementStyle,
    PageMargin,
    DEFAULT_PAGE_MARGINS,
    DEFAULT_SKIPPED_SCENE_LETTERS,
    ShelfEntry,
    DocumentNode,
    TimelineLayer,
    TimelineClip,
    ProjectStatus,
} from "@src/lib/project/project-state";
import { Screenplay } from "@src/lib/utils/types";
import { ScreenplayElement, TitlePageElement, Style, PageFormat } from "@src/lib/utils/enums";
import {
    RevisionDisplayMode,
    DEFAULT_REVISION_DISPLAY_MODE,
    captureRevisionBaseline,
} from "@src/lib/screenplay/revisions";
import { SearchMatch } from "@src/lib/screenplay/extensions/search-highlight-extension";
import { useAssetGc } from "@src/lib/assets/use-asset-gc";

// Import types only - these don't cause module loading
import type { ThrottledWebsocketProvider } from "@src/lib/cloud/utils";
import type { ProjectRepository } from "@src/lib/project/project-repository";

// -------------------------------- //
//          TYPE DEFINITIONS        //
// -------------------------------- //

export interface ProjectContextType {
    // Project data
    /** The active project's id (stable for the provider's lifetime). */
    projectId: string;
    project: ProjectMembershipPayload | null;
    updateProject: (project: ProjectMembershipPayload) => void;

    // Project repository (provides access to Yjs document and all project data)
    repository: ProjectRepository | null;
    provider: ThrottledWebsocketProvider | null;
    isYjsReady: boolean;
    /** True once the doc has loaded from the local cache *and* the cloud (or
     *  the cloud doesn't apply). Anything that writes to the doc based on what
     *  is missing from it must wait for this, not for `isYjsReady`. */
    isYjsSynced: boolean;

    /** True when the current user has VIEWER role on a cloud project.
     *  All edit affordances must be hidden/disabled when this is true,
     *  and the repository's writes are no-ops as a safety net. */
    isReadOnly: boolean;

    // Connection state
    connectionStatus: ConnectionStatus;
    users: CollaboratorInfo[];

    // Editor (only set when on screenplay page)
    editor: Editor | null;
    updateEditor: (editor: Editor | null) => void;
    screenplay: Screenplay;
    characters: CharacterMap | undefined;
    locations: LocationMap | undefined;
    scenes: Scene[];
    updateScenes: (scenes: Scene[]) => void;

    // Screenplay format state (for navbar dropdown)
    selectedElement: ScreenplayElement;
    setSelectedElement: (element: ScreenplayElement) => void;
    selectedStyles: Style;
    setSelectedStyles: (styles: Style | ((prev: Style) => Style)) => void;

    // Character dialogue highlighting
    highlightedCharacters: Set<string>;
    toggleCharacterHighlight: (characterName: string) => void;

    // Page format
    pageFormat: PageFormat;
    setPageFormat: (format: PageFormat) => void;
    pageMargins: PageMargin;
    setPageMargins: (margins: PageMargin) => void;
    displaySceneNumbers: boolean;
    setDisplaySceneNumbers: (display: boolean) => void;
    sceneHeadingSpacing: number;
    setSceneHeadingSpacing: (spacing: number) => void;
    sceneNumberOnRight: boolean;
    setSceneNumberOnRight: (onRight: boolean) => void;
    contdLabel: string;
    setContdLabel: (label: string) => void;
    moreLabel: string;
    setMoreLabel: (label: string) => void;
    headerLeft: string;
    setHeaderLeft: (template: string) => void;
    headerMiddle: string;
    setHeaderMiddle: (template: string) => void;
    headerRight: string;
    setHeaderRight: (template: string) => void;
    showFirstPageHeader: boolean;
    setShowFirstPageHeader: (show: boolean) => void;
    footerLeft: string;
    setFooterLeft: (template: string) => void;
    footerMiddle: string;
    setFooterMiddle: (template: string) => void;
    footerRight: string;
    setFooterRight: (template: string) => void;
    showFirstPageFooter: boolean;
    setShowFirstPageFooter: (show: boolean) => void;
    elementMargins: Record<string, { left: number; right: number }>;
    setElementMargins: (margins: Record<string, { left: number; right: number }>) => void;
    elementStyles: Record<string, ElementStyle>;
    setElementStyles: (styles: Record<string, ElementStyle>) => void;

    // Production
    sceneLocking: boolean;
    setSceneLocking: (locked: boolean) => void;
    sceneNumberingStyle: "suffix" | "prefix";
    setSceneNumberingStyle: (style: "suffix" | "prefix") => void;
    skippedSceneLetters: string[];
    setSkippedSceneLetters: (letters: string[]) => void;
    /** Raw persistent scene map (UUID → PersistentScene). Includes synopsis,
     *  color, and production-lock fields (token, omitted) for every scene that
     *  has been persisted. */
    persistentScenes: PersistentSceneMap;

    /** Page-locking master switch (production lock for page numbering). */
    pageLocking: boolean;
    setPageLocking: (locked: boolean) => void;
    /** Raw persistent page-lock map (anchor data-id → PersistentPage).
     *  Keyed by `PAGE_ONE_KEY` for page 1, by the top-level node's data-id
     *  for subsequent pages. */
    persistentPages: PersistentPageMap;

    /** Revisions master switch (production change-tracking). */
    revisionsEnabled: boolean;
    setRevisionsEnabled: (enabled: boolean) => void;
    /** Active revision index (into REVISION_COLORS; 0 = White base draft). New
     *  edits are stamped with this value. */
    currentRevision: number;
    setCurrentRevision: (index: number) => void;
    /** How committed revision marks are displayed (independent of stamping). */
    revisionDisplayMode: RevisionDisplayMode;
    setRevisionDisplayMode: (mode: RevisionDisplayMode) => void;

    // Search state
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    searchFilters: Set<ScreenplayElement>;
    setSearchFilters: (filters: Set<ScreenplayElement>) => void;
    currentSearchIndex: number;
    setCurrentSearchIndex: (index: number) => void;
    searchMatches: SearchMatch[];
    setSearchMatches: (matches: SearchMatch[]) => void;
    /** Editor that search/replace targets: the focused screenplay-type editor
     *  (draft or tree document), falling back to the main screenplay. */
    activeSearchEditor: Editor | null;

    // Project metadata (for title page placeholders)
    projectTitle: string;
    setProjectTitle: (title: string) => void;
    projectAuthor: string;
    setProjectAuthor: (author: string) => void;

    // Title page editor (only set when on title page view)
    titlePageEditor: Editor | null;
    updateTitlePageEditor: (editor: Editor | null) => void;
    selectedTitlePageElement: TitlePageElement;
    setSelectedTitlePageElement: (element: TitlePageElement) => void;

    // Focus tracking for format dropdown context switching
    focusedEditorType: "screenplay" | "title" | "draft" | null;
    setFocusedEditorType: (type: "screenplay" | "title" | "draft" | null) => void;

    // Draft (shelf) editor instance
    draftEditor: Editor | null;
    updateDraftEditor: (editor: Editor | null) => void;

    // Shelf
    shelfEntries: Record<string, ShelfEntry>;
    activeShelfVersion: { nodeId: string; versionId: string } | null;
    setActiveShelfVersion: (v: { nodeId: string; versionId: string } | null) => void;

    // Document tree (folders + editor/board documents)
    documents: Record<string, DocumentNode>;
    documentEditor: Editor | null;
    updateDocumentEditor: (editor: Editor | null) => void;

    // Timeline (horizontal, minute-scaled lanes of scene/card clips)
    timelineLayers: Record<string, TimelineLayer>;
    timelineClips: Record<string, TimelineClip>;
    /** A board card to focus next time its board canvas mounts/becomes visible
     *  (set when navigating to a card from the Timeline). Cleared by the canvas. */
    boardFocusCardId: string | null;
    setBoardFocusCardId: (cardId: string | null) => void;
}

// -------------------------------- //
//          DEFAULT VALUES          //
// -------------------------------- //

const defaultContextValue: ProjectContextType = {
    projectId: "",
    project: null,
    updateProject: () => {},
    repository: null,
    provider: null,
    isYjsReady: false,
    isYjsSynced: false,
    isReadOnly: false,

    connectionStatus: "disconnected",
    users: [],
    editor: null,
    updateEditor: () => {},
    selectedElement: ScreenplayElement.Action,
    setSelectedElement: () => {},
    selectedStyles: Style.None,
    setSelectedStyles: () => {},
    highlightedCharacters: new Set<string>(),
    toggleCharacterHighlight: () => {},
    pageFormat: "LETTER",
    setPageFormat: () => {},
    pageMargins: DEFAULT_PAGE_MARGINS,
    setPageMargins: () => {},
    displaySceneNumbers: false,
    setDisplaySceneNumbers: () => {},
    sceneHeadingSpacing: 1,
    setSceneHeadingSpacing: () => {},
    sceneNumberOnRight: false,
    setSceneNumberOnRight: () => {},
    contdLabel: "(CONT'D)",
    setContdLabel: () => {},
    moreLabel: "(MORE)",
    setMoreLabel: () => {},
    headerLeft: "",
    setHeaderLeft: () => {},
    headerMiddle: "",
    setHeaderMiddle: () => {},
    headerRight: "#.",
    setHeaderRight: () => {},
    showFirstPageHeader: false,
    setShowFirstPageHeader: () => {},
    footerLeft: "",
    setFooterLeft: () => {},
    footerMiddle: "",
    setFooterMiddle: () => {},
    footerRight: "",
    setFooterRight: () => {},
    showFirstPageFooter: false,
    setShowFirstPageFooter: () => {},
    elementMargins: {},
    setElementMargins: () => {},
    elementStyles: {},
    setElementStyles: () => {},
    sceneLocking: false,
    setSceneLocking: () => {},
    sceneNumberingStyle: "suffix",
    setSceneNumberingStyle: () => {},
    skippedSceneLetters: DEFAULT_SKIPPED_SCENE_LETTERS,
    setSkippedSceneLetters: () => {},
    persistentScenes: {},
    pageLocking: false,
    setPageLocking: () => {},
    persistentPages: {},
    revisionsEnabled: false,
    setRevisionsEnabled: () => {},
    currentRevision: 0,
    setCurrentRevision: () => {},
    revisionDisplayMode: DEFAULT_REVISION_DISPLAY_MODE,
    setRevisionDisplayMode: () => {},
    characters: {},
    locations: {},
    scenes: [],
    updateScenes: () => {},
    screenplay: [],
    // Search state defaults
    searchTerm: "",
    setSearchTerm: () => {},
    searchFilters: new Set<ScreenplayElement>([
        ScreenplayElement.Scene,
        ScreenplayElement.Action,
        ScreenplayElement.Character,
        ScreenplayElement.Dialogue,
        ScreenplayElement.Parenthetical,
        ScreenplayElement.Transition,
        ScreenplayElement.Section,
    ]),
    setSearchFilters: () => {},
    currentSearchIndex: 0,
    setCurrentSearchIndex: () => {},
    searchMatches: [],
    setSearchMatches: () => {},
    activeSearchEditor: null,
    // Project metadata defaults
    projectTitle: "",
    setProjectTitle: () => {},
    projectAuthor: "",
    setProjectAuthor: () => {},
    // Title page defaults
    titlePageEditor: null,
    updateTitlePageEditor: () => {},
    selectedTitlePageElement: TitlePageElement.Title,
    setSelectedTitlePageElement: () => {},
    // Focus tracking defaults
    focusedEditorType: null,
    setFocusedEditorType: () => {},
    // Draft editor defaults
    draftEditor: null,
    updateDraftEditor: () => {},
    // Shelf defaults
    shelfEntries: {},
    activeShelfVersion: null,
    setActiveShelfVersion: () => {},
    // Document tree defaults
    documents: {},
    documentEditor: null,
    updateDocumentEditor: () => {},
    // Timeline defaults
    timelineLayers: {},
    timelineClips: {},
    boardFocusCardId: null,
    setBoardFocusCardId: () => {},
};

export const ProjectContext = createContext<ProjectContextType>(defaultContextValue);

// Stable context for rarely-changing infrastructure values.
// Prevents ProjectLayoutInner from re-rendering on every screenplay change.
interface ProjectReadyContextType {
    status: ProjectStatus;
}

const ProjectReadyContext = createContext<ProjectReadyContextType>({
    status: { kind: "loading" },
});

export const useProjectReady = () => useContext(ProjectReadyContext);

// -------------------------------- //
//          PROVIDER                //
// -------------------------------- //

interface ProjectProviderProps {
    children: ReactNode;
    projectId: string;
}

export const ProjectProvider = ({ children, projectId }: ProjectProviderProps) => {
    // Get user settings for collaboration
    const { user } = useUser();

    // Memoize user info to prevent recreating on every render
    const userName = user?.username;
    const userColor = user?.color;

    // Initialize Yjs with stable user info
    const {
        ydoc,
        provider,
        status,
        isSynced: isYjsSynced,
        connectionStatus: yjsConnectionStatus,
        users: yjsUsers,
    } = useProjectYjs({
        projectId,
        userName,
        userColor,
        userId: user?.id,
    });

    // Derived for downstream consumers (editor, board, etc.) that only care
    // whether the project is renderable, not which error state we're in.
    const isYjsReady = status.kind === "ready";

    // Repository state - loaded dynamically
    const [repository, setRepository] = useState<ProjectRepository | null>(null);

    const [project, setProject] = useState<ProjectMembershipPayload | null>(null);
    const isReadOnly = !!project && project.role === ProjectRole.VIEWER;
    const [editor, setEditor] = useState<Editor | null>(null);
    const [screenplay, setScreenplay] = useState<Screenplay>([]);
    const [characters, setCharacters] = useState<CharacterMap | undefined>(undefined);
    const [locations, setLocations] = useState<LocationMap | undefined>(undefined);
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [selectedElement, setSelectedElementState] = useState<ScreenplayElement>(
        ScreenplayElement.Action,
    );
    const [selectedStyles, setSelectedStylesState] = useState<Style>(Style.None);
    const [highlightedCharacters, setHighlightedCharacters] = useState<Set<string>>(new Set());
    const [pageFormat, setPageFormatState] = useState<PageFormat>("LETTER");
    const [pageMargins, setPageMarginsState] = useState<PageMargin>(DEFAULT_PAGE_MARGINS);
    const [displaySceneNumbers, setDisplaySceneNumbersState] = useState<boolean>(false);
    const [sceneHeadingSpacing, setSceneHeadingSpacingState] = useState<number>(1);
    const [sceneNumberOnRight, setSceneNumberOnRightState] = useState<boolean>(false);
    const [contdLabel, setContdLabelState] = useState<string>("(CONT'D)");
    const [moreLabel, setMoreLabelState] = useState<string>("(MORE)");
    const [headerLeft, setHeaderLeftState] = useState<string>("");
    const [headerMiddle, setHeaderMiddleState] = useState<string>("");
    const [headerRight, setHeaderRightState] = useState<string>("#.");
    const [showFirstPageHeader, setShowFirstPageHeaderState] = useState<boolean>(false);
    const [footerLeft, setFooterLeftState] = useState<string>("");
    const [footerMiddle, setFooterMiddleState] = useState<string>("");
    const [footerRight, setFooterRightState] = useState<string>("");
    const [showFirstPageFooter, setShowFirstPageFooterState] = useState<boolean>(false);
    const [elementMargins, setElementMarginsState] = useState<
        Record<string, { left: number; right: number }>
    >({});
    const [elementStyles, setElementStylesState] = useState<Record<string, ElementStyle>>({});
    const [sceneLocking, setSceneLockingState] = useState<boolean>(false);
    const [sceneNumberingStyle, setSceneNumberingStyleState] =
        useState<"suffix" | "prefix">("suffix");
    const [skippedSceneLetters, setSkippedSceneLettersState] =
        useState<string[]>(DEFAULT_SKIPPED_SCENE_LETTERS);
    const [persistentScenes, setPersistentScenesState] = useState<PersistentSceneMap>({});
    const [pageLocking, setPageLockingState] = useState<boolean>(false);
    const [persistentPages, setPersistentPagesState] = useState<PersistentPageMap>({});
    const [revisionsEnabled, setRevisionsEnabledState] = useState<boolean>(false);
    const [currentRevision, setCurrentRevisionState] = useState<number>(0);
    const [revisionDisplayMode, setRevisionDisplayModeState] =
        useState<RevisionDisplayMode>(DEFAULT_REVISION_DISPLAY_MODE);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
    const [users, setUsers] = useState<CollaboratorInfo[]>([]);

    // Search state
    const [searchTerm, setSearchTermState] = useState<string>("");
    const [searchFilters, setSearchFiltersState] = useState<Set<ScreenplayElement>>(
        new Set([
            ScreenplayElement.Scene,
            ScreenplayElement.Action,
            ScreenplayElement.Character,
            ScreenplayElement.Dialogue,
            ScreenplayElement.Parenthetical,
            ScreenplayElement.Transition,
            ScreenplayElement.Section,
        ]),
    );
    const [currentSearchIndex, setCurrentSearchIndexState] = useState<number>(0);
    const [searchMatches, setSearchMatchesState] = useState<SearchMatch[]>([]);

    // Project metadata state (for title page placeholders)
    const [projectTitle, setProjectTitleState] = useState<string>("");
    const [projectAuthor, setProjectAuthorState] = useState<string>("");

    // Title page state
    const [titlePageEditor, setTitlePageEditor] = useState<Editor | null>(null);
    const [selectedTitlePageElement, setSelectedTitlePageElementState] = useState<TitlePageElement>(
        TitlePageElement.Title,
    );

    // Focus tracking state
    const [focusedEditorType, setFocusedEditorTypeState] = useState<
        "screenplay" | "title" | "draft" | null
    >(null);

    // Draft editor state
    const [draftEditor, setDraftEditor] = useState<Editor | null>(null);
    const updateDraftEditor = useCallback((editor: Editor | null) => setDraftEditor(editor), []);

    // Shelf state
    const [shelfEntries, setShelfEntries] = useState<Record<string, ShelfEntry>>({});
    const [activeShelfVersion, setActiveShelfVersion] = useState<{
        nodeId: string;
        versionId: string;
    } | null>(null);

    // Document-tree state
    const [documents, setDocuments] = useState<Record<string, DocumentNode>>({});
    const [documentEditor, setDocumentEditor] = useState<Editor | null>(null);
    const updateDocumentEditor = useCallback((editor: Editor | null) => setDocumentEditor(editor), []);

    // Timeline state
    const [timelineLayers, setTimelineLayers] = useState<Record<string, TimelineLayer>>({});
    const [timelineClips, setTimelineClips] = useState<Record<string, TimelineClip>>({});
    const [boardFocusCardId, setBoardFocusCardId] = useState<string | null>(null);

    // Create repository instance when ydoc is available (dynamically imported)
    useEffect(() => {
        if (!ydoc) {
            setRepository(null);
            return;
        }

        let isMounted = true;

        const loadRepository = async () => {
            const { createProjectRepository } = await import("@src/lib/project/project-repository");
            if (isMounted) {
                setRepository(createProjectRepository(ydoc));
            }
        };

        loadRepository();

        return () => {
            isMounted = false;
        };
    }, [ydoc]);

    useEffect(() => {
        repository?.setReadOnly(isReadOnly);
    }, [repository, isReadOnly]);

    // Keep IndexedDB image assets reconciled with the document (orphan sweep).
    useAssetGc(projectId, repository, isYjsReady);

    // The DO pushes a role-changed message whenever an admin updates this
    // user's role. Mirror it into local state so isReadOnly flips and the
    // editor/repository gates apply immediately, without waiting for an SWR
    // revalidation of the membership endpoint.
    useEffect(() => {
        if (!provider) return;
        const handler = async (newRole: string) => {
            setProject((prev) => (prev ? { ...prev, role: newRole as ProjectRole } : prev));
            if (project?.project.id) {
                try {
                    const { token } = await getCloudToken(project.project.id);
                    if (token) {
                        // Update token silently so future reconnects use the new role.
                        // We don't force reconnect because the DO already updated our active session.
                        await provider.updateToken(token, false);
                    }
                } catch (e) {
                    console.warn("Failed to fetch new token on role change", e);
                }
            }
        };
        provider.on("role-changed", handler);
        return () => {
            provider.off("role-changed", handler);
        };
    }, [provider, project?.project.id]);

    const updateScreenplay = useCallback((newScreenplay: Screenplay) => {
        setScreenplay(newScreenplay);
    }, []);

    const updateScenes = useCallback((newScenes: Scene[]) => {
        setScenes(newScenes);
    }, []);

    const updateCharacters = useCallback((newCharacters: CharacterMap) => {
        setCharacters(newCharacters);
    }, []);

    const updateLocations = useCallback((newLocations: LocationMap) => {
        setLocations(newLocations);
    }, []);

    useEffect(() => {
        if (!repository) return;

        // Helper function to recompute all derived data from screenplay
        const recomputeFromScreenplay = (newScreenplay: Screenplay) => {
            const allScenes = mergeScenesData(repository.scenes, newScreenplay);
            const allCharacters = mergeCharactersData(repository.characters, newScreenplay);
            const allLocations = mergeLocationsData(repository.locations, newScreenplay);

            updateScreenplay(newScreenplay);
            updateScenes(allScenes);
            updateCharacters(allCharacters);
            updateLocations(allLocations);
        };

        // Initial computation
        const initialScreenplay = repository.screenplay;
        recomputeFromScreenplay(initialScreenplay);

        // Observe screenplay changes
        repository.registerScreenplayCallback((newScreenplay: Screenplay) => {
            recomputeFromScreenplay(newScreenplay);
        });

        // Read initial layout data (observer only fires on CHANGES, not on
        // the current state — without this, layout-dependent state like
        // elementStyles starts as {} and defaults always win).
        const initialLayout = repository.getLayout();
        if (initialLayout) {
            if (
                initialLayout.pageSize &&
                (initialLayout.pageSize === "A4" || initialLayout.pageSize === "LETTER")
            ) {
                setPageFormatState(initialLayout.pageSize);
            }
            if (initialLayout.pageMargins !== undefined) {
                setPageMarginsState(initialLayout.pageMargins);
            }
            if (initialLayout.displaySceneNumbers !== undefined) {
                setDisplaySceneNumbersState(initialLayout.displaySceneNumbers);
            }
            if (initialLayout.sceneHeadingSpacing !== undefined) {
                setSceneHeadingSpacingState(initialLayout.sceneHeadingSpacing);
            }
            if (initialLayout.sceneNumberOnRight !== undefined) {
                setSceneNumberOnRightState(initialLayout.sceneNumberOnRight);
            }
            if (initialLayout.contdLabel !== undefined) {
                setContdLabelState(initialLayout.contdLabel);
            }
            if (initialLayout.moreLabel !== undefined) {
                setMoreLabelState(initialLayout.moreLabel);
            }
            if (initialLayout.headerLeft !== undefined) {
                setHeaderLeftState(initialLayout.headerLeft);
            }
            if (initialLayout.headerMiddle !== undefined) {
                setHeaderMiddleState(initialLayout.headerMiddle);
            }
            if (initialLayout.headerRight !== undefined) {
                setHeaderRightState(initialLayout.headerRight);
            }
            if (initialLayout.showFirstPageHeader !== undefined) {
                setShowFirstPageHeaderState(initialLayout.showFirstPageHeader);
            }
            if (initialLayout.footerLeft !== undefined) {
                setFooterLeftState(initialLayout.footerLeft);
            }
            if (initialLayout.footerMiddle !== undefined) {
                setFooterMiddleState(initialLayout.footerMiddle);
            }
            if (initialLayout.footerRight !== undefined) {
                setFooterRightState(initialLayout.footerRight);
            }
            if (initialLayout.showFirstPageFooter !== undefined) {
                setShowFirstPageFooterState(initialLayout.showFirstPageFooter);
            }
            if (initialLayout.elementMargins !== undefined) {
                setElementMarginsState(initialLayout.elementMargins);
            }
            if (initialLayout.elementStyles !== undefined) {
                setElementStylesState(initialLayout.elementStyles);
            }
        }

        // Read initial production data (separate Y.Map from layout).
        const initialProduction = repository.getProduction();
        if (initialProduction) {
            if (initialProduction.sceneLocking !== undefined) {
                setSceneLockingState(initialProduction.sceneLocking);
            }
            if (initialProduction.sceneNumberingStyle !== undefined) {
                setSceneNumberingStyleState(initialProduction.sceneNumberingStyle);
            }
            if (initialProduction.skippedSceneLetters !== undefined) {
                setSkippedSceneLettersState(initialProduction.skippedSceneLetters);
            }
            if (initialProduction.pageLocking !== undefined) {
                setPageLockingState(initialProduction.pageLocking);
            }
            if (initialProduction.revisionsEnabled !== undefined) {
                setRevisionsEnabledState(initialProduction.revisionsEnabled);
            }
            if (initialProduction.currentRevision !== undefined) {
                setCurrentRevisionState(initialProduction.currentRevision);
            }
            if (initialProduction.revisionDisplayMode !== undefined) {
                setRevisionDisplayModeState(initialProduction.revisionDisplayMode);
            }
        }

        // Read initial persistent scenes & pages
        setPersistentScenesState(repository.scenes);
        setPersistentPagesState(repository.pages);

        // Observe layout changes
        const unsubscribeLayout = repository.observeLayout((layout: Partial<LayoutData>) => {
            const _pageSize = layout.pageSize;
            const _displaySceneNumbers = layout.displaySceneNumbers;

            const _sceneHeadingSpacing = layout.sceneHeadingSpacing;
            const _sceneNumberOnRight = layout.sceneNumberOnRight;
            const _contdLabel = layout.contdLabel;
            const _moreLabel = layout.moreLabel;

            if (_pageSize && (_pageSize === "A4" || _pageSize === "LETTER")) {
                setPageFormatState(_pageSize);
            }
            if (layout.pageMargins !== undefined) {
                setPageMarginsState(layout.pageMargins);
            }
            if (_displaySceneNumbers !== undefined) {
                setDisplaySceneNumbersState(_displaySceneNumbers);
            }

            if (_sceneHeadingSpacing !== undefined) {
                setSceneHeadingSpacingState(_sceneHeadingSpacing);
            }
            if (_sceneNumberOnRight !== undefined) {
                setSceneNumberOnRightState(_sceneNumberOnRight);
            }
            if (_contdLabel !== undefined) {
                setContdLabelState(_contdLabel);
            }
            if (_moreLabel !== undefined) {
                setMoreLabelState(_moreLabel);
            }
            if (layout.headerLeft !== undefined) {
                setHeaderLeftState(layout.headerLeft);
            }
            if (layout.headerMiddle !== undefined) {
                setHeaderMiddleState(layout.headerMiddle);
            }
            if (layout.headerRight !== undefined) {
                setHeaderRightState(layout.headerRight);
            }
            if (layout.showFirstPageHeader !== undefined) {
                setShowFirstPageHeaderState(layout.showFirstPageHeader);
            }
            if (layout.footerLeft !== undefined) {
                setFooterLeftState(layout.footerLeft);
            }
            if (layout.footerMiddle !== undefined) {
                setFooterMiddleState(layout.footerMiddle);
            }
            if (layout.footerRight !== undefined) {
                setFooterRightState(layout.footerRight);
            }
            if (layout.showFirstPageFooter !== undefined) {
                setShowFirstPageFooterState(layout.showFirstPageFooter);
            }
            if (layout.elementMargins !== undefined) {
                setElementMarginsState(layout.elementMargins);
            }
            if (layout.elementStyles !== undefined) {
                setElementStylesState(layout.elementStyles);
            }
        });

        // Observe production changes
        const unsubscribeProduction = repository.observeProduction((production: Partial<ProductionData>) => {
            if (production.sceneLocking !== undefined) {
                setSceneLockingState(production.sceneLocking);
            }
            if (production.sceneNumberingStyle !== undefined) {
                setSceneNumberingStyleState(production.sceneNumberingStyle);
            }
            if (production.skippedSceneLetters !== undefined) {
                setSkippedSceneLettersState(production.skippedSceneLetters);
            }
            if (production.pageLocking !== undefined) {
                setPageLockingState(production.pageLocking);
            }
            if (production.revisionsEnabled !== undefined) {
                setRevisionsEnabledState(production.revisionsEnabled);
            }
            if (production.currentRevision !== undefined) {
                setCurrentRevisionState(production.currentRevision);
            }
            if (production.revisionDisplayMode !== undefined) {
                setRevisionDisplayModeState(production.revisionDisplayMode);
            }
        });

        // Observe page-lock changes
        const unsubscribePages = repository.observePages((pages: PersistentPageMap) => {
            setPersistentPagesState(pages);
        });

        // Observe character changes - get current screenplay from repository
        const unsubscribeCharacters = repository.observeCharacters((_characters: CharacterMap) => {
            const currentScreenplay = repository.screenplay;
            const allCharacters = mergeCharactersData(_characters, currentScreenplay);
            updateCharacters(allCharacters);
        });

        // Observe location changes - get current screenplay from repository
        const unsubscribeLocations = repository.observeLocations((_locations: LocationMap) => {
            const currentScreenplay = repository.screenplay;
            const allLocations = mergeLocationsData(_locations, currentScreenplay);
            updateLocations(allLocations);
        });

        // Observe scene changes - get current screenplay from repository
        const unsubscribeScenes = repository.observeScenes((_scenes: PersistentSceneMap) => {
            const currentScreenplay = repository.screenplay;
            const allScenes = mergeScenesData(_scenes, currentScreenplay);
            updateScenes(allScenes);
            setPersistentScenesState(_scenes);
        });

        // Observe metadata changes (for title page placeholders)
        const initialTitle = repository.getTitle();
        const initialAuthor = repository.getAuthor();
        setProjectTitleState(initialTitle);
        setProjectAuthorState(initialAuthor);
        const unsubscribeMetadata = repository.observeMetadata((metadata) => {
            if (metadata.title !== undefined) setProjectTitleState(metadata.title);
            if (metadata.author !== undefined) setProjectAuthorState(metadata.author);
        });

        // Observe shelf changes
        setShelfEntries(repository.shelfEntries);
        const unsubscribeShelf = repository.observeShelf((entries) => {
            setShelfEntries(entries);
        });

        // Observe document-tree changes
        setDocuments(repository.documents);
        const unsubscribeDocuments = repository.observeDocuments((docs) => {
            setDocuments(docs);
        });

        // Observe timeline changes
        setTimelineLayers(repository.timelineLayers);
        setTimelineClips(repository.timelineClips);
        const unsubscribeTimelineLayers = repository.observeTimelineLayers((layers) => {
            setTimelineLayers(layers);
        });
        const unsubscribeTimelineClips = repository.observeTimelineClips((clips) => {
            setTimelineClips(clips);
        });

        return () => {
            repository.unregisterScreenplayCallback(recomputeFromScreenplay);
            unsubscribeLayout();
            unsubscribeProduction();
            unsubscribePages();
            unsubscribeCharacters();
            unsubscribeLocations();
            unsubscribeScenes();
            unsubscribeMetadata();
            unsubscribeShelf();
            unsubscribeDocuments();
            unsubscribeTimelineLayers();
            unsubscribeTimelineClips();
        };
    }, [repository, updateCharacters, updateLocations, updateScenes, updateScreenplay]);

    // Seed Yjs metadata from the database project record if not yet set
    useEffect(() => {
        if (!repository || !project) return;

        const initialTitle = repository.getTitle();
        if (!initialTitle && project.project.title) {
            repository.setTitle(project.project.title);
            setProjectTitleState(project.project.title);
        }

        const initialAuthor = repository.getAuthor();
        if (!initialAuthor && project.project.author) {
            repository.setAuthor(project.project.author);
            setProjectAuthorState(project.project.author);
        }
    }, [repository, project]);

    // Seed Yjs metadata from local storage as a fallback (covers local-only projects
    // and cloud projects where the Yjs doc has never had title/author written to it).
    // Calling setTitle/setAuthor writes to the Yjs metadata map, which fires
    // observeMetadata → setProjectTitleState/setProjectAuthorState automatically.
    useEffect(() => {
        if (!repository) return;
        const seed = async () => {
            const hasTitle = !!repository.getTitle();
            const hasAuthor = !!repository.getAuthor();
            if (hasTitle && hasAuthor) return;
            const { getCachedProject } =
                await import("@src/lib/persistence/storage-provider/local-persistence");
            const local = await getCachedProject(projectId);
            if (!local) return;
            if (!hasTitle && local.title) repository.setTitle(local.title);
            if (!hasAuthor && local.author) repository.setAuthor(local.author);
        };
        seed();
    }, [repository, projectId]);

    useEffect(() => {
        setConnectionStatus(yjsConnectionStatus);
    }, [yjsConnectionStatus]);

    useEffect(() => {
        setUsers(yjsUsers);
    }, [yjsUsers]);

    // Stable update functions
    // The browser tab title is owned by [useProjectNavbar], which also restores
    // the app default when the project closes.
    const updateProject = useCallback((newProject: ProjectMembershipPayload) => {
        setProject(newProject);
    }, []);

    const updateEditor = useCallback((newEditor: Editor | null) => {
        setEditor(newEditor);
    }, []);

    const setSelectedElement = useCallback((element: ScreenplayElement) => {
        setSelectedElementState(element);
    }, []);

    const setSelectedStyles = useCallback((styles: Style | ((prev: Style) => Style)) => {
        setSelectedStylesState(styles);
    }, []);

    const toggleCharacterHighlight = useCallback((characterName: string) => {
        setHighlightedCharacters((prev) => {
            const newSet = new Set(prev);
            const upperName = characterName.toUpperCase();
            if (newSet.has(upperName)) {
                newSet.delete(upperName);
            } else {
                newSet.add(upperName);
            }
            return newSet;
        });
    }, []);

    const setPageFormat = useCallback(
        (format: PageFormat) => {
            setPageFormatState(format);
            repository?.setPageSize(format);
        },
        [repository],
    );

    const setPageMargins = useCallback(
        (margins: PageMargin) => {
            setPageMarginsState(margins);
            repository?.setPageMargins(margins);
        },
        [repository],
    );

    const setDisplaySceneNumbers = useCallback(
        (display: boolean) => {
            setDisplaySceneNumbersState(display);
            repository?.setDisplaySceneNumbers(display);
        },
        [repository],
    );

    const setSceneHeadingSpacing = useCallback(
        (spacing: number) => {
            setSceneHeadingSpacingState(spacing);
            repository?.setSceneHeadingSpacing(spacing);
        },
        [repository],
    );

    const setSceneNumberOnRight = useCallback(
        (onRight: boolean) => {
            setSceneNumberOnRightState(onRight);
            repository?.setSceneNumberOnRight(onRight);
        },
        [repository],
    );

    const setContdLabel = useCallback(
        (label: string) => {
            setContdLabelState(label);
            repository?.setContdLabel(label);
        },
        [repository],
    );

    const setMoreLabel = useCallback(
        (label: string) => {
            setMoreLabelState(label);
            repository?.setMoreLabel(label);
        },
        [repository],
    );

    const setHeaderLeft = useCallback(
        (template: string) => {
            setHeaderLeftState(template);
            repository?.setHeaderLeft(template);
        },
        [repository],
    );

    const setHeaderMiddle = useCallback(
        (template: string) => {
            setHeaderMiddleState(template);
            repository?.setHeaderMiddle(template);
        },
        [repository],
    );

    const setHeaderRight = useCallback(
        (template: string) => {
            setHeaderRightState(template);
            repository?.setHeaderRight(template);
        },
        [repository],
    );

    const setShowFirstPageHeader = useCallback(
        (show: boolean) => {
            setShowFirstPageHeaderState(show);
            repository?.setShowFirstPageHeader(show);
        },
        [repository],
    );

    const setFooterLeft = useCallback(
        (template: string) => {
            setFooterLeftState(template);
            repository?.setFooterLeft(template);
        },
        [repository],
    );

    const setFooterMiddle = useCallback(
        (template: string) => {
            setFooterMiddleState(template);
            repository?.setFooterMiddle(template);
        },
        [repository],
    );

    const setFooterRight = useCallback(
        (template: string) => {
            setFooterRightState(template);
            repository?.setFooterRight(template);
        },
        [repository],
    );

    const setShowFirstPageFooter = useCallback(
        (show: boolean) => {
            setShowFirstPageFooterState(show);
            repository?.setShowFirstPageFooter(show);
        },
        [repository],
    );

    const setElementMargins = useCallback(
        (margins: Record<string, { left: number; right: number }>) => {
            setElementMarginsState(margins);
            repository?.setElementMargins(margins);
        },
        [repository],
    );

    const setElementStyles = useCallback(
        (styles: Record<string, ElementStyle>) => {
            setElementStylesState(styles);
            repository?.setElementStyles(styles);
        },
        [repository],
    );

    const setSceneLocking = useCallback(
        (locked: boolean) => {
            setSceneLockingState(locked);
            repository?.setSceneLocking(locked);
        },
        [repository],
    );

    const setPageLocking = useCallback(
        (locked: boolean) => {
            setPageLockingState(locked);
            repository?.setPageLocking(locked);
        },
        [repository],
    );

    /**
     * Snapshot every line's current text as the baseline for revision `index` —
     * the draft that revision's asterisks will be measured against, so a line
     * edited and then restored can drop its mark again.
     *
     * Needs the mounted screenplay editor for the document. When there is none
     * (the revision was changed from a view that has no editor) nothing is
     * written, and stamping stays on the event-based path until the next advance
     * captures one — which over-marks rather than mis-clears.
     */
    const captureRevisionBase = useCallback(
        (index: number) => {
            if (!repository || !editor) return;
            repository.captureRevisionBase(index, captureRevisionBaseline(editor.state.doc, index));
        },
        [repository, editor],
    );

    /**
     * Adopt a baseline for a revision that has none, so revision marks start being
     * derived rather than accumulated.
     *
     * Without this a project whose revision opened before baselines existed — or
     * one advanced while no editor was mounted to snapshot it — stays on the
     * event-based path indefinitely, since nothing short of an advance captures
     * one. Taking it mid-revision is safe: `captureRevisionBaseline` records
     * `self` for every line already marked at this revision, so those keep their
     * marks unconditionally and only lines edited from here on are judged by
     * comparison.
     *
     * Gated on the Yjs sync, and on the editor having actually bound to a
     * populated document: freezing an empty screenplay as the baseline would make
     * every real line read as new the moment it was touched.
     */
    useEffect(() => {
        if (!isYjsSynced || !editor || !repository) return;
        if (!revisionsEnabled || currentRevision < 1) return;
        if (repository.getRevisionBaseline()?.index === currentRevision) return;
        if (editor.state.doc.content.size === 0 && (repository.getState()?.screenplayFragment().length ?? 0) > 0)
            return;
        captureRevisionBase(currentRevision);
    }, [isYjsSynced, editor, repository, revisionsEnabled, currentRevision, captureRevisionBase]);

    const setRevisionsEnabled = useCallback(
        (enabled: boolean) => {
            setRevisionsEnabledState(enabled);
            repository?.setRevisionsEnabled(enabled);
            // Switching stamping on is where the current revision starts measuring
            // from, so take a baseline if this revision hasn't got one yet.
            if (enabled && currentRevision >= 1 && repository?.getRevisionBaseline()?.index !== currentRevision) {
                captureRevisionBase(currentRevision);
            }
        },
        [repository, currentRevision, captureRevisionBase],
    );

    const setCurrentRevision = useCallback(
        (index: number) => {
            setCurrentRevisionState(index);
            repository?.setCurrentRevision(index);
            // A revision opens: the document as it stands right now is the draft
            // this revision's marks will be compared against.
            if (index >= 1) captureRevisionBase(index);
        },
        [repository, captureRevisionBase],
    );

    const setRevisionDisplayMode = useCallback(
        (mode: RevisionDisplayMode) => {
            setRevisionDisplayModeState(mode);
            repository?.setRevisionDisplayMode(mode);
        },
        [repository],
    );

    const setSceneNumberingStyle = useCallback(
        (style: "suffix" | "prefix") => {
            setSceneNumberingStyleState(style);
            repository?.setSceneNumberingStyle(style);
        },
        [repository],
    );

    const setSkippedSceneLetters = useCallback(
        (letters: string[]) => {
            setSkippedSceneLettersState(letters);
            repository?.setSkippedSceneLetters(letters);
        },
        [repository],
    );

    const setSearchTerm = useCallback((term: string) => {
        setSearchTermState(term);
        // Reset to first match when search term changes
        setCurrentSearchIndexState(0);
    }, []);

    const setSearchFilters = useCallback((filters: Set<ScreenplayElement>) => {
        setSearchFiltersState(filters);
        // Reset to first match when filters change
        setCurrentSearchIndexState(0);
    }, []);

    const setCurrentSearchIndex = useCallback((index: number) => {
        setCurrentSearchIndexState(index);
    }, []);

    const setSearchMatches = useCallback((matches: SearchMatch[]) => {
        setSearchMatchesState(matches);
    }, []);

    const setProjectTitle = useCallback(
        (title: string) => {
            setProjectTitleState(title);
            repository?.setTitle(title);
        },
        [repository],
    );

    const setProjectAuthor = useCallback(
        (author: string) => {
            setProjectAuthorState(author);
            repository?.setAuthor(author);
        },
        [repository],
    );

    const updateTitlePageEditor = useCallback((newEditor: Editor | null) => {
        setTitlePageEditor(newEditor);
    }, []);

    const setSelectedTitlePageElement = useCallback((element: TitlePageElement) => {
        setSelectedTitlePageElementState(element);
    }, []);

    const setFocusedEditorType = useCallback((type: "screenplay" | "title" | "draft" | null) => {
        setFocusedEditorTypeState(type);
    }, []);

    // Scope search to the focused screenplay-type editor. `focusedEditorType`
    // flips on every editor focus change, so it gates *when* we re-resolve, while
    // `isFocused` picks the concrete editor — disambiguating a draft from a tree
    // document, which both report "draft". Falls back to the main screenplay.
    const activeSearchEditor = useMemo(
        () => [editor, draftEditor, documentEditor].find((e) => e?.isFocused) ?? editor,
        // focusedEditorType is the intentional re-resolve trigger (not read directly).
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [focusedEditorType, editor, draftEditor, documentEditor],
    );

    const contextValue = useMemo<ProjectContextType>(
        () => ({
            projectId,
            project,
            updateProject,
            repository,
            provider,
            isYjsReady,
            isYjsSynced,
            isReadOnly,
            connectionStatus,
            users,
            editor,
            updateEditor,
            selectedElement,
            setSelectedElement,
            selectedStyles,
            setSelectedStyles,
            highlightedCharacters,
            toggleCharacterHighlight,
            pageFormat,
            setPageFormat,
            pageMargins,
            setPageMargins,
            displaySceneNumbers,
            setDisplaySceneNumbers,
            sceneHeadingSpacing,
            setSceneHeadingSpacing,
            sceneNumberOnRight,
            setSceneNumberOnRight,
            contdLabel,
            setContdLabel,
            moreLabel,
            setMoreLabel,
            headerLeft,
            setHeaderLeft,
            headerMiddle,
            setHeaderMiddle,
            headerRight,
            setHeaderRight,
            showFirstPageHeader,
            setShowFirstPageHeader,
            footerLeft,
            setFooterLeft,
            footerMiddle,
            setFooterMiddle,
            footerRight,
            setFooterRight,
            showFirstPageFooter,
            setShowFirstPageFooter,
            elementMargins,
            setElementMargins,
            elementStyles,
            setElementStyles,
            sceneLocking,
            setSceneLocking,
            sceneNumberingStyle,
            setSceneNumberingStyle,
            skippedSceneLetters,
            setSkippedSceneLetters,
            persistentScenes,
            pageLocking,
            setPageLocking,
            persistentPages,
            revisionsEnabled,
            setRevisionsEnabled,
            currentRevision,
            setCurrentRevision,
            revisionDisplayMode,
            setRevisionDisplayMode,
            screenplay,
            scenes,
            updateScenes,
            locations,
            characters,
            searchTerm,
            setSearchTerm,
            searchFilters,
            setSearchFilters,
            currentSearchIndex,
            setCurrentSearchIndex,
            searchMatches,
            setSearchMatches,
            activeSearchEditor,
            projectTitle,
            setProjectTitle,
            projectAuthor,
            setProjectAuthor,
            titlePageEditor,
            updateTitlePageEditor,
            selectedTitlePageElement,
            setSelectedTitlePageElement,
            focusedEditorType,
            setFocusedEditorType,
            draftEditor,
            updateDraftEditor,
            shelfEntries,
            activeShelfVersion,
            setActiveShelfVersion,
            documents,
            documentEditor,
            updateDocumentEditor,
            timelineLayers,
            timelineClips,
            boardFocusCardId,
            setBoardFocusCardId,
        }),
        [
            projectId,
            project,
            updateProject,
            repository,
            provider,
            isYjsReady,
            isYjsSynced,
            isReadOnly,
            connectionStatus,
            users,
            editor,
            updateEditor,
            selectedElement,
            setSelectedElement,
            selectedStyles,
            setSelectedStyles,
            highlightedCharacters,
            toggleCharacterHighlight,
            pageFormat,
            setPageFormat,
            pageMargins,
            setPageMargins,
            displaySceneNumbers,
            setDisplaySceneNumbers,
            sceneHeadingSpacing,
            setSceneHeadingSpacing,
            sceneNumberOnRight,
            setSceneNumberOnRight,
            contdLabel,
            setContdLabel,
            moreLabel,
            setMoreLabel,
            headerLeft,
            setHeaderLeft,
            headerMiddle,
            setHeaderMiddle,
            headerRight,
            setHeaderRight,
            showFirstPageHeader,
            setShowFirstPageHeader,
            footerLeft,
            setFooterLeft,
            footerMiddle,
            setFooterMiddle,
            footerRight,
            setFooterRight,
            showFirstPageFooter,
            setShowFirstPageFooter,
            elementMargins,
            setElementMargins,
            elementStyles,
            setElementStyles,
            sceneLocking,
            setSceneLocking,
            sceneNumberingStyle,
            setSceneNumberingStyle,
            skippedSceneLetters,
            setSkippedSceneLetters,
            persistentScenes,
            pageLocking,
            setPageLocking,
            persistentPages,
            revisionsEnabled,
            setRevisionsEnabled,
            currentRevision,
            setCurrentRevision,
            revisionDisplayMode,
            setRevisionDisplayMode,
            screenplay,
            scenes,
            updateScenes,
            locations,
            characters,
            searchTerm,
            setSearchTerm,
            searchFilters,
            setSearchFilters,
            currentSearchIndex,
            setCurrentSearchIndex,
            searchMatches,
            setSearchMatches,
            activeSearchEditor,
            projectTitle,
            setProjectTitle,
            projectAuthor,
            setProjectAuthor,
            titlePageEditor,
            updateTitlePageEditor,
            selectedTitlePageElement,
            setSelectedTitlePageElement,
            focusedEditorType,
            setFocusedEditorType,
            draftEditor,
            updateDraftEditor,
            shelfEntries,
            activeShelfVersion,
            setActiveShelfVersion,
            documents,
            documentEditor,
            updateDocumentEditor,
            timelineLayers,
            timelineClips,
            boardFocusCardId,
            setBoardFocusCardId,
        ],
    );

    const readyValue = useMemo(() => ({ status }), [status]);

    return (
        <ProjectReadyContext.Provider value={readyValue}>
            <ProjectContext.Provider value={contextValue}>{children}</ProjectContext.Provider>
        </ProjectReadyContext.Provider>
    );
};
