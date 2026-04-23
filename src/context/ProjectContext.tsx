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
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { useUser } from "@src/lib/utils/hooks";
import {
    CollaboratorInfo,
    ConnectionStatus,
    LayoutData,
    useProjectYjs,
    ElementStyle,
    PageMargin,
    DEFAULT_PAGE_MARGINS,
    ShelfEntry,
} from "@src/lib/project/project-state";
import { Screenplay } from "@src/lib/utils/types";
import { ScreenplayElement, TitlePageElement, Style, PageFormat } from "@src/lib/utils/enums";
import { SearchMatch } from "@src/lib/screenplay/extensions/search-highlight-extension";

// Import types only - these don't cause module loading
import type { ThrottledWebsocketProvider } from "@src/lib/cloud/utils";
import type { ProjectRepository } from "@src/lib/project/project-repository";

// -------------------------------- //
//          TYPE DEFINITIONS        //
// -------------------------------- //

export interface ProjectContextType {
    // Project data
    project: ProjectMembershipPayload | null;
    updateProject: (project: ProjectMembershipPayload) => void;

    // Project repository (provides access to Yjs document and all project data)
    repository: ProjectRepository | null;
    provider: ThrottledWebsocketProvider | null;
    isYjsReady: boolean;

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
    elementMargins: Record<string, { left: number; right: number }>;
    setElementMargins: (margins: Record<string, { left: number; right: number }>) => void;
    elementStyles: Record<string, ElementStyle>;
    setElementStyles: (styles: Record<string, ElementStyle>) => void;

    // Search state
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    searchFilters: Set<ScreenplayElement>;
    setSearchFilters: (filters: Set<ScreenplayElement>) => void;
    currentSearchIndex: number;
    setCurrentSearchIndex: (index: number) => void;
    searchMatches: SearchMatch[];
    setSearchMatches: (matches: SearchMatch[]) => void;

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
}

// -------------------------------- //
//          DEFAULT VALUES          //
// -------------------------------- //

const defaultContextValue: ProjectContextType = {
    project: null,
    updateProject: () => {},
    repository: null,
    provider: null,
    isYjsReady: false,

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
    elementMargins: {},
    setElementMargins: () => {},
    elementStyles: {},
    setElementStyles: () => {},
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
};

export const ProjectContext = createContext<ProjectContextType>(defaultContextValue);

// Stable context for rarely-changing infrastructure values.
// Prevents ProjectLayoutInner from re-rendering on every screenplay change.
interface ProjectReadyContextType {
    isYjsReady: boolean;
    isProjectUnavailable: boolean;
}

const ProjectReadyContext = createContext<ProjectReadyContextType>({
    isYjsReady: false,
    isProjectUnavailable: false,
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
        isReady: isYjsReady,
        connectionStatus: yjsConnectionStatus,
        users: yjsUsers,
        isProjectUnavailable,
    } = useProjectYjs({
        projectId,
        userName,
        userColor,
        userId: user?.id,
    });

    // Repository state - loaded dynamically
    const [repository, setRepository] = useState<ProjectRepository | null>(null);

    const [project, setProject] = useState<ProjectMembershipPayload | null>(null);
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
    const [elementMargins, setElementMarginsState] = useState<
        Record<string, { left: number; right: number }>
    >({});
    const [elementStyles, setElementStylesState] = useState<Record<string, ElementStyle>>({});
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
            if (initialLayout.elementMargins !== undefined) {
                setElementMarginsState(initialLayout.elementMargins);
            }
            if (initialLayout.elementStyles !== undefined) {
                setElementStylesState(initialLayout.elementStyles);
            }
        }

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
            if (layout.elementMargins !== undefined) {
                setElementMarginsState(layout.elementMargins);
            }
            if (layout.elementStyles !== undefined) {
                setElementStylesState(layout.elementStyles);
            }
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

        return () => {
            repository.unregisterScreenplayCallback(recomputeFromScreenplay);
            unsubscribeLayout();
            unsubscribeCharacters();
            unsubscribeLocations();
            unsubscribeScenes();
            unsubscribeMetadata();
            unsubscribeShelf();
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
    const updateProject = useCallback((newProject: ProjectMembershipPayload) => {
        document.title = `${newProject.project.title}`;
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

    const contextValue = useMemo<ProjectContextType>(
        () => ({
            project,
            updateProject,
            repository,
            provider,
            isYjsReady,
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
            elementMargins,
            setElementMargins,
            elementStyles,
            setElementStyles,
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
        }),
        [
            project,
            updateProject,
            repository,
            provider,
            isYjsReady,
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
            elementMargins,
            setElementMargins,
            elementStyles,
            setElementStyles,
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
        ],
    );

    const readyValue = useMemo(
        () => ({ isYjsReady, isProjectUnavailable }),
        [isYjsReady, isProjectUnavailable],
    );

    return (
        <ProjectReadyContext.Provider value={readyValue}>
            <ProjectContext.Provider value={contextValue}>{children}</ProjectContext.Provider>
        </ProjectReadyContext.Provider>
    );
};
