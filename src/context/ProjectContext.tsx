"use client";

import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Editor } from "@tiptap/react";
import { ThrottledWebsocketProvider } from "@src/lib/collaboration/utils";
import { CharacterMap, mergeCharactersData } from "@src/lib/screenplay/characters";
import { LocationMap, mergeLocationsData } from "@src/lib/screenplay/locations";
import { mergeScenesData, PersistentSceneMap, Scene } from "@src/lib/screenplay/scenes";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { useUser } from "@src/lib/utils/hooks";
import {
    CollaboratorInfo,
    ConnectionStatus,
    createProjectRepository,
    LayoutData,
    ProjectRepository,
    useProjectYjs,
} from "@src/lib/project/project-yjs";
import { Screenplay } from "@src/lib/utils/types";
import { ScreenplayElement, Style, PageFormat } from "@src/lib/utils/enums";
import { SearchMatch } from "@src/lib/screenplay/extensions/search-highlight-extension";

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
    isLockedByServer: false,
    isSessionReplaced: false,
    connectionStatus: "disconnected",
    updateConnectionStatus: () => {},
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
    displaySceneNumbers: true,
    setDisplaySceneNumbers: () => {},
    characters: {},
    locations: {},
    scenes: [],
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
    } = useProjectYjs({
        projectId,
        userName,
        userColor,
    });

    // Create repository instance when ydoc is available
    const repository = useMemo(() => createProjectRepository(ydoc), [ydoc]);
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
    const [displaySceneNumbers, setDisplaySceneNumbersState] = useState<boolean>(true);

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
        ])
    );
    const [currentSearchIndex, setCurrentSearchIndexState] = useState<number>(0);
    const [searchMatches, setSearchMatchesState] = useState<SearchMatch[]>([]);

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
        const initialScreenplay = repository.getScreenplay();
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
            const currentScreenplay = repository.getScreenplay();
            const allCharacters = mergeCharactersData(_characters, currentScreenplay);
            updateCharacters(allCharacters);
        });

        // Observe location changes - get current screenplay from repository
        const unsubscribeLocations = repository.observeLocations((_locations: LocationMap) => {
            const currentScreenplay = repository.getScreenplay();
            const allLocations = mergeLocationsData(_locations, currentScreenplay);
            updateLocations(allLocations);
        });

        // Observe scene changes - get current screenplay from repository
        const unsubscribeScenes = repository.observeScenes((_scenes: PersistentSceneMap) => {
            const currentScreenplay = repository.getScreenplay();
            const allScenes = mergeScenesData(_scenes, currentScreenplay);
            updateScenes(allScenes);
        });

        return () => {
            unsubscribeScreenplay();
            unsubscribeLayout();
            unsubscribeCharacters();
            unsubscribeLocations();
            unsubscribeScenes();
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
        [repository]
    );

    const setDisplaySceneNumbers = useCallback(
        (display: boolean) => {
            setDisplaySceneNumbersState(display);
            repository?.setDisplaySceneNumber(display);
        },
        [repository]
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
        ]
    );

    return <ProjectContext.Provider value={contextValue}>{children}</ProjectContext.Provider>;
};
