"use client";

import { createContext, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import { ThrottledWebsocketProvider } from "@src/lib/collaboration/utils";
import { CharacterMap, mergeCharactersData } from "@src/lib/screenplay/characters";
import { ComputedScenesData, MergedScenesData, PersistentSceneItem, mergeScenesData } from "@src/lib/screenplay/scenes";
import { computeFullScenesData } from "@src/lib/screenplay/screenplay";
import { ProjectMembershipPayload } from "@src/server/repository/project-repository";
import { useSettings } from "@src/lib/utils/hooks";
import type { Doc } from "yjs";
import {
    CollaboratorInfo,
    ConnectionStatus,
    getCharactersMap,
    getScenesMap,
    useProjectYjs,
} from "@src/lib/project/project-yjs";
import { Screenplay } from "@src/lib/utils/types";
import debounce from "debounce";

// -------------------------------- //
//          CONSTANTS               //
// -------------------------------- //

const CHARACTER_UPDATE_DELAY = 500;
const SCENE_UPDATE_DELAY = 500;

const EMPTY_SCREENPLAY: Screenplay = {
    type: "doc",
    content: [],
    attrs: {},
};

// -------------------------------- //
//          TYPE DEFINITIONS        //
// -------------------------------- //

export interface ProjectContextType {
    // Project data
    project: ProjectMembershipPayload | null;
    updateProject: (project: ProjectMembershipPayload) => void;

    // Yjs document and provider (shared across all project pages)
    ydoc: Doc | null;
    provider: ThrottledWebsocketProvider | null;
    isYjsReady: boolean;
    isLockedByServer: boolean;
    isSessionReplaced: boolean;

    // Connection state
    connectionStatus: ConnectionStatus;
    updateConnectionStatus: (status: ConnectionStatus) => void;
    users: CollaboratorInfo[];

    // Editor (only set when on screenplay page)
    editor: Editor | null;
    updateEditor: (editor: Editor | null) => void;

    // Screenplay data
    screenplay: Screenplay;
    updateScreenplay: (screenplay: Screenplay) => void;

    // Scenes data (merged persistent + computed)
    scenesData: MergedScenesData;
    updateComputedScenes: (data: ComputedScenesData | ((prev: ComputedScenesData) => ComputedScenesData)) => void;

    // Characters data
    charactersData: CharacterMap;
    updateCharactersData: (data: CharacterMap | ((prev: CharacterMap) => CharacterMap)) => void;
}

// -------------------------------- //
//          DEFAULT VALUES          //
// -------------------------------- //

const defaultContextValue: ProjectContextType = {
    project: null,
    updateProject: () => {},
    ydoc: null,
    provider: null,
    isYjsReady: false,
    isLockedByServer: false,
    isSessionReplaced: false,
    connectionStatus: "disconnected",
    updateConnectionStatus: () => {},
    users: [],
    editor: null,
    updateEditor: () => {},
    screenplay: EMPTY_SCREENPLAY,
    updateScreenplay: () => {},
    scenesData: [],
    updateComputedScenes: () => {},
    charactersData: {},
    updateCharactersData: () => {},
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
    const { settings } = useSettings();

    // Memoize user info to prevent recreating on every render
    const userName = settings?.online?.username;
    const userColor = settings?.online?.color;

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

    // Local state
    const [project, setProject] = useState<ProjectMembershipPayload | null>(null);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [screenplay, setScreenplay] = useState<Screenplay>(EMPTY_SCREENPLAY);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
    const [users, setUsers] = useState<CollaboratorInfo[]>([]);

    // Characters state
    const [charactersData, setCharactersData] = useState<CharacterMap>({});
    const [persistentCharacters, setPersistentCharacters] = useState<CharacterMap>({});

    // Debounced character merge function
    const debouncedCharacterMergeRef = useRef(
        debounce((persistent: CharacterMap, sp: Screenplay) => {
            const mergedCharacters = mergeCharactersData(persistent, sp);
            setCharactersData(mergedCharacters);
        }, CHARACTER_UPDATE_DELAY)
    );

    // Debounced scene computation function
    const debouncedSceneUpdateRef = useRef(
        debounce((sp: Screenplay, updateFn: (scenes: ComputedScenesData) => void) => {
            // Pass a minimal context object with just the update function
            computeFullScenesData(sp, { updateComputedScenes: updateFn } as ProjectContextType);
        }, SCENE_UPDATE_DELAY)
    );

    // Scenes state
    const [scenesData, setScenesData] = useState<MergedScenesData>([]);
    const [computedScenes, setComputedScenes] = useState<ComputedScenesData>([]);
    const [persistentScenes, setPersistentScenes] = useState<Map<string, PersistentSceneItem>>(new Map());

    useEffect(() => {
        setConnectionStatus(yjsConnectionStatus);
    }, [yjsConnectionStatus]);

    useEffect(() => {
        setUsers(yjsUsers);
    }, [yjsUsers]);

    useEffect(() => {
        if (!ydoc) {
            setPersistentCharacters({});
            return;
        }

        const charactersMap = getCharactersMap(ydoc);
        const syncPersistentCharacters = () => {
            const newPersistentCharacters: CharacterMap = {};
            charactersMap.forEach((value, key) => {
                newPersistentCharacters[key] = value;
            });
            setPersistentCharacters(newPersistentCharacters);
        };

        syncPersistentCharacters();
        charactersMap.observe(syncPersistentCharacters);

        return () => {
            charactersMap.unobserve(syncPersistentCharacters);
        };
    }, [ydoc]);

    useEffect(() => {
        debouncedCharacterMergeRef.current(persistentCharacters, screenplay);
    }, [persistentCharacters, screenplay]);
    useEffect(() => {
        debouncedSceneUpdateRef.current(screenplay, setComputedScenes);
    }, [screenplay]);

    useEffect(() => {
        if (!ydoc) {
            setPersistentScenes(new Map());
            return;
        }

        const scenesMap = getScenesMap(ydoc);
        const syncPersistentScenes = () => {
            const newPersistentScenes = new Map<string, PersistentSceneItem>();
            scenesMap.forEach((value, key) => {
                newPersistentScenes.set(key, value);
            });
            setPersistentScenes(newPersistentScenes);
        };

        syncPersistentScenes();
        scenesMap.observe(syncPersistentScenes);

        return () => {
            scenesMap.unobserve(syncPersistentScenes);
        };
    }, [ydoc]);

    // Merge persistent scenes (from Yjs) with computed scenes (from screenplay)
    useEffect(() => {
        const mergedScenes = mergeScenesData(persistentScenes, computedScenes);
        setScenesData(mergedScenes);
    }, [persistentScenes, computedScenes]);

    // Stable update functions
    const updateProject = useCallback((newProject: ProjectMembershipPayload) => {
        setProject(newProject);
    }, []);

    const updateEditor = useCallback((newEditor: Editor | null) => {
        setEditor(newEditor);
    }, []);

    const updateScreenplay = useCallback((newScreenplay: Screenplay) => {
        setScreenplay(newScreenplay);
    }, []);

    const updateComputedScenes = useCallback(
        (data: ComputedScenesData | ((prev: ComputedScenesData) => ComputedScenesData)) => {
            setComputedScenes(data);
        },
        []
    );

    const updateCharactersData = useCallback((data: CharacterMap | ((prev: CharacterMap) => CharacterMap)) => {
        setCharactersData(data);
    }, []);

    const updateConnectionStatus = useCallback((status: ConnectionStatus) => {
        setConnectionStatus(status);
    }, []);

    const contextValue = useMemo<ProjectContextType>(
        () => ({
            project,
            updateProject,
            ydoc,
            provider,
            isYjsReady,
            connectionStatus,
            updateConnectionStatus,
            users,
            editor,
            updateEditor,
            screenplay,
            updateScreenplay,
            scenesData,
            updateComputedScenes,
            charactersData,
            updateCharactersData,
            isLockedByServer,
            isSessionReplaced,
        }),
        [
            project,
            updateProject,
            ydoc,
            provider,
            isYjsReady,
            connectionStatus,
            updateConnectionStatus,
            users,
            editor,
            updateEditor,
            screenplay,
            updateScreenplay,
            scenesData,
            updateComputedScenes,
            charactersData,
            updateCharactersData,
            isLockedByServer,
            isSessionReplaced,
        ]
    );

    return <ProjectContext.Provider value={contextValue}>{children}</ProjectContext.Provider>;
};
