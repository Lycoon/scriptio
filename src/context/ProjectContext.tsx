"use client";

import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Editor } from "@tiptap/react";
import { CharacterMap, mergeCharactersData } from "@src/lib/screenplay/characters";
import { LocationMap, mergeLocationsData } from "@src/lib/screenplay/locations";
import { mergeScenesData, PersistentSceneMap, Scene } from "@src/lib/screenplay/scenes";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { useUser } from "@src/lib/utils/hooks";
import { CollaboratorInfo, ConnectionStatus, LayoutData, useProjectYjs } from "@src/lib/project/project-state";
import { Comment, Screenplay } from "@src/lib/utils/types";
import { ScreenplayElement, Style, PageFormat } from "@src/lib/utils/enums";
import { SearchMatch } from "@src/lib/screenplay/extensions/search-highlight-extension";

// Import types only - these don't cause module loading
import type { ThrottledWebsocketProvider } from "@src/lib/collaboration/utils";
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
    isLockedByServer: boolean;
    isSessionReplaced: boolean;
    isProjectUnavailable: boolean;

    // Connection state
    updateConnectionStatus: (status: ConnectionStatus) => void;
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
    displaySceneNumbers: boolean;
    setDisplaySceneNumbers: (display: boolean) => void;

    // Search state
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    searchFilters: Set<ScreenplayElement>;
    setSearchFilters: (filters: Set<ScreenplayElement>) => void;
    currentSearchIndex: number;
    setCurrentSearchIndex: (index: number) => void;
    searchMatches: SearchMatch[];
    setSearchMatches: (matches: SearchMatch[]) => void;

    // Comments state
    comments: Comment[];
    activeCommentId: string | null;
    setActiveCommentId: (id: string | null) => void;
}

// -------------------------------- //
//          DEFAULT VALUES          //
// -------------------------------- //

const defaultContextValue: ProjectContextType = {
    project: null,
    updateProject: () => { },
    repository: null,
    provider: null,
    isYjsReady: false,
    isLockedByServer: false,
    isSessionReplaced: false,
    isProjectUnavailable: false,
    connectionStatus: "disconnected",
    updateConnectionStatus: () => { },
    users: [],
    editor: null,
    updateEditor: () => { },
    selectedElement: ScreenplayElement.Action,
    setSelectedElement: () => { },
    selectedStyles: Style.None,
    setSelectedStyles: () => { },
    highlightedCharacters: new Set<string>(),
    toggleCharacterHighlight: () => { },
    pageFormat: "LETTER",
    setPageFormat: () => { },
    displaySceneNumbers: false,
    setDisplaySceneNumbers: () => { },
    characters: {},
    locations: {},
    scenes: [],
    updateScenes: () => { },
    screenplay: [],
    // Search state defaults
    searchTerm: "",
    setSearchTerm: () => { },
    searchFilters: new Set<ScreenplayElement>([
        ScreenplayElement.Scene,
        ScreenplayElement.Action,
        ScreenplayElement.Character,
        ScreenplayElement.Dialogue,
        ScreenplayElement.Parenthetical,
        ScreenplayElement.Transition,
        ScreenplayElement.Section,
    ]),
    setSearchFilters: () => { },
    currentSearchIndex: 0,
    setCurrentSearchIndex: () => { },
    searchMatches: [],
    setSearchMatches: () => { },
    // Comments state defaults
    comments: [],
    activeCommentId: null,
    setActiveCommentId: () => { },
};

export const ProjectContext = createContext<ProjectContextType>(defaultContextValue);

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
        refreshAndReconnect,
        isLockedByServer,
        isSessionReplaced,
        isProjectUnavailable,
    } = useProjectYjs({
        projectId,
        userName,
        userColor,
    });

    // Repository state - loaded dynamically
    const [repository, setRepository] = useState<ProjectRepository | null>(null);
    const [screenplay, updateScreenplay] = useState<Screenplay>([]);
    const [scenes, updateScenes] = useState<Scene[]>([]);
    const [characters, updateCharacters] = useState<CharacterMap>();
    const [locations, updateLocations] = useState<LocationMap>();

    // Local state
    const [project, setProject] = useState<ProjectMembershipPayload | null>(null);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
    const [users, setUsers] = useState<CollaboratorInfo[]>([]);

    // Screenplay format state
    const [selectedElement, setSelectedElementState] = useState<ScreenplayElement>(ScreenplayElement.Action);
    const [selectedStyles, setSelectedStylesState] = useState<Style>(Style.None);

    // Character dialogue highlighting state
    const [highlightedCharacters, setHighlightedCharacters] = useState<Set<string>>(new Set());

    // Page format state
    const [pageFormat, setPageFormatState] = useState<PageFormat>("LETTER");

    // Display scene numbers state
    const [displaySceneNumbers, setDisplaySceneNumbersState] = useState<boolean>(false);

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

    // Comments state
    const [comments, setComments] = useState<Comment[]>([]);
    const [activeCommentId, setActiveCommentIdState] = useState<string | null>(null);

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
        const unsubscribeScreenplay = repository.observeScreenplay((newScreenplay: Screenplay) => {
            recomputeFromScreenplay(newScreenplay);
        });

        // Observe layout changes
        const unsubscribeLayout = repository.observeLayout((layout: Partial<LayoutData>) => {
            const _pageSize = layout.pageSize;
            const _displaySceneNumber = layout.displaySceneNumbers;

            if (_pageSize && (_pageSize === "A4" || _pageSize === "LETTER")) {
                setPageFormatState(_pageSize);
            }
            if (_displaySceneNumber !== undefined) {
                setDisplaySceneNumbersState(_displaySceneNumber);
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

        // Observe comments changes
        const initialComments = Object.values(repository.comments);
        setComments(initialComments);
        const unsubscribeComments = repository.observeComments((commentsMap) => {
            setComments(Object.values(commentsMap));
        });

        return () => {
            unsubscribeScreenplay();
            unsubscribeLayout();
            unsubscribeCharacters();
            unsubscribeLocations();
            unsubscribeScenes();
            unsubscribeComments();
        };
    }, [repository]);

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

    const updateConnectionStatus = useCallback((status: ConnectionStatus) => {
        setConnectionStatus(status);
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

    const setDisplaySceneNumbers = useCallback(
        (display: boolean) => {
            setDisplaySceneNumbersState(display);
            repository?.setDisplaySceneNumber(display);
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

    const setActiveCommentId = useCallback((id: string | null) => {
        setActiveCommentIdState(id);
    }, []);

    const contextValue = useMemo<ProjectContextType>(
        () => ({
            project,
            updateProject,
            repository,
            provider,
            isYjsReady,
            connectionStatus,
            updateConnectionStatus,
            users,
            editor,
            updateEditor,
            isLockedByServer,
            isSessionReplaced,
            isProjectUnavailable,
            selectedElement,
            setSelectedElement,
            selectedStyles,
            setSelectedStyles,
            highlightedCharacters,
            toggleCharacterHighlight,
            pageFormat,
            setPageFormat,
            displaySceneNumbers,
            setDisplaySceneNumbers,
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
            comments,
            activeCommentId,
            setActiveCommentId,
        }),
        [
            project,
            updateProject,
            repository,
            provider,
            isYjsReady,
            connectionStatus,
            updateConnectionStatus,
            users,
            editor,
            updateEditor,
            isLockedByServer,
            isSessionReplaced,
            isProjectUnavailable,
            selectedElement,
            setSelectedElement,
            selectedStyles,
            setSelectedStyles,
            highlightedCharacters,
            toggleCharacterHighlight,
            pageFormat,
            setPageFormat,
            displaySceneNumbers,
            setDisplaySceneNumbers,
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
            comments,
            activeCommentId,
            setActiveCommentId,
        ],
    );

    return <ProjectContext.Provider value={contextValue}>{children}</ProjectContext.Provider>;
};
