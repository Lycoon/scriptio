"use client";

import { Editor } from "@tiptap/react";
import { ReactNode, useContext, useEffect, useState } from "react";
import { UserContext } from "@src/context/UserContext";
import { useSpellcheck } from "@src/context/SpellcheckContext";
import { refreshSpellcheck } from "@src/lib/spellcheck/spellcheck-extension";
import { Scene } from "@src/lib/screenplay/scenes";

import context from "./ContextMenu.module.css";
import {
    ContextMenu as ContextMenuSurface,
    ContextMenuItem,
    ContextMenuSeparator,
} from "@components/utils/ContextMenu";
import { CharacterData, deleteCharacter } from "@src/lib/screenplay/characters";
import { LocationData, deleteLocation } from "@src/lib/screenplay/locations";
import { isTauri } from "@tauri-apps/api/core";
import { cutText, focusOnPosition, pasteText, selectTextInEditor } from "@src/lib/screenplay/editor";
import { addCharacterPopup, editCharacterPopup, editScenePopup } from "@src/lib/screenplay/popup";
import { ProjectContext } from "@src/context/ProjectContext";
import { useTranslations } from "next-intl";
import {
    Archive,
    ArrowDownRight,
    BookPlus,
    ClipboardPaste,
    Columns2,
    Copy,
    EyeOff,
    Eye,
    Highlighter,
    ListTree,
    Loader2,
    MessageSquarePlus,
    Pencil,
    Scissors,
    SeparatorHorizontal,
    Trash2,
    UserRound,
} from "lucide-react";
import { makeDualDialogue } from "@src/lib/screenplay/dual-dialogue";
import { extractShelveCandidate } from "@src/lib/shelf/shelf-utils";
import { omitSceneByUuid, unomitSceneByUuid } from "@src/lib/screenplay/scene-locking";
import { ScreenplayElement } from "@src/lib/utils/enums";
import { MAIN_SCREENPLAY_REF } from "@src/lib/project/project-state";

/* ==================== */
/*     Context menu     */
/* ==================== */

export type ContextMenuProps =
    | {
          type: ContextMenuType;
          position: { x: number; y: number };
          typeSpecificProps: unknown;
      }
    | {
          /** Pre-rendered content for menus not driven by the editor type switch
           *  (board cards, document tree). */
          content: ReactNode;
          position: { x: number; y: number };
      };

export const enum ContextMenuType {
    SceneList,
    SceneItem,
    CharacterList,
    CharacterItem,
    LocationItem,
    Suggestion,
    EditorSelection,
    Spellcheck,
    DualDialogue,
    ShelveNode,
    EditorContextMenu,
}

type SubMenuProps<T> = { props: T };

const openWebSearch = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const url = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
    if (isTauri()) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(url);
    } else {
        window.open(url, "_blank");
    }
};

const readClipboardText = async (): Promise<string> => {
    if (isTauri()) {
        const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
        return readText();
    }
    return navigator.clipboard.readText();
};

/* ========================== */
/*     Scene context menu     */
/* ========================== */

export type SceneContextProps = {
    scene: Scene;
};

const SceneItemMenu = ({ props }: SubMenuProps<SceneContextProps>) => {
    const t = useTranslations("contextMenu");
    const userCtx = useContext(UserContext);
    const { editor, isReadOnly, repository } = useContext(ProjectContext);
    const scene: Scene = props.scene;

    const canOmit = !!scene.id && !scene.omitted;
    const canUnomit = !!scene.id && !!scene.omitted;

    const handleOmit = () => {
        if (!editor || !repository || !scene.id) return;
        omitSceneByUuid(editor, repository, scene.id);
    };

    const handleUnomit = () => {
        if (!editor || !repository || !scene.id) return;
        unomitSceneByUuid(editor, repository, scene.id);
    };

    const handleSendToOutline = () => {
        if (!repository || !scene.id) return;
        repository.addOutlineItem({
            source: "scene",
            refDocId: MAIN_SCREENPLAY_REF,
            refId: scene.id,
            title: scene.title,
            preview: scene.synopsis || scene.preview,
            color: scene.color,
            parentId: null,
        });
    };

    return (
        <>
            <ContextMenuItem
                text={t("goToScene")}
                icon={ArrowDownRight}
                action={() => focusOnPosition(editor!, scene.position)}
            />
            <ContextMenuItem
                text={t("selectInEditor")}
                action={() => selectTextInEditor(editor!, scene.position, scene.nextPosition)}
            />
            {!isReadOnly && (
                <>
                    <ContextMenuSeparator />
                    {scene.id && (
                        <ContextMenuItem
                            text={t("sendToOutline")}
                            icon={ListTree}
                            action={handleSendToOutline}
                        />
                    )}
                    <ContextMenuItem text={t("edit")} icon={Pencil} action={() => editScenePopup(scene, userCtx)} />
                    <ContextMenuItem
                        text={t("cut")}
                        action={() => cutText(editor!, scene.position, scene.nextPosition)}
                    />
                    {canOmit && (
                        <ContextMenuItem text={t("omitScene")} icon={EyeOff} action={handleOmit} />
                    )}
                    {canUnomit && (
                        <ContextMenuItem text={t("unomitScene")} icon={Eye} action={handleUnomit} />
                    )}
                </>
            )}
        </>
    );
};

const SceneListMenu = () => {
    return <></>;
    //return <>{<ContextMenuItem text={"Add scene"} action={addScene} />}</>;
};

/* ======================== */
/*  Character context menu  */
/* ======================== */

export type CharacterContextProps = {
    character: CharacterData;
};

const CharacterItemMenu = ({ props }: SubMenuProps<CharacterContextProps>) => {
    const t = useTranslations("contextMenu");
    const userCtx = useContext(UserContext);
    const projectCtx = useContext(ProjectContext);
    const { toggleCharacterHighlight, isReadOnly } = projectCtx;
    const character: CharacterData = props.character;

    return (
        <>
            {!isReadOnly && (
                <>
                    <ContextMenuItem text={t("edit")} icon={Pencil} action={() => editCharacterPopup(character, userCtx)} />
                    <ContextMenuItem text={t("remove")} action={() => deleteCharacter(character.name, projectCtx)} />
                    <ContextMenuItem
                        text={t("paste")}
                        action={() => pasteText(projectCtx.editor!, character.name)}
                    />
                    <ContextMenuSeparator />
                </>
            )}
            <ContextMenuItem
                text={t("highlight")}
                icon={Highlighter}
                action={() => toggleCharacterHighlight(character.name)}
            />
        </>
    );
};

const CharacterListMenu = () => {
    const t = useTranslations("contextMenu");
    const userCtx = useContext(UserContext);
    return <ContextMenuItem icon={UserRound} text={t("addCharacter")} action={() => addCharacterPopup(userCtx)} />;
};

/* ======================== */
/*  Location context menu   */
/* ======================== */

export type LocationContextProps = {
    location: LocationData;
};

const LocationItemMenu = ({ props }: SubMenuProps<LocationContextProps>) => {
    const t = useTranslations("contextMenu");
    const projectCtx = useContext(ProjectContext);
    const { isReadOnly } = projectCtx;
    const location: LocationData = props.location;

    if (isReadOnly) return null;

    return (
        <>
            <ContextMenuItem icon={Trash2} text={t("remove")} action={() => deleteLocation(location.name, projectCtx)} />
            <ContextMenuItem
                text={t("paste")}
                action={() => pasteText(projectCtx.editor!, location.name)}
            />
        </>
    );
};

/* ============================== */
/*  Editor Selection context menu  */
/* ============================== */

export type EditorSelectionContextProps = {
    from: number;
    to: number;
    onAddComment: () => void;
};

const EditorSelectionMenu = ({ props }: SubMenuProps<EditorSelectionContextProps>) => {
    const t = useTranslations("contextMenu");
    const projectCtx = useContext(ProjectContext);
    const { editor, isReadOnly } = projectCtx;
    const { updateContextMenu } = useContext(UserContext);
    const { from, to, onAddComment } = props;
    const hasSelection = from !== to;

    const handleCopy = async () => {
        if (!editor) return;
        const text = editor.state.doc.textBetween(from, to, "\n");
        await navigator.clipboard.writeText(text);
        updateContextMenu(undefined);
    };

    const handleCut = async () => {
        if (!editor || isReadOnly) return;
        const text = editor.state.doc.textBetween(from, to, "\n");
        await navigator.clipboard.writeText(text);
        editor.commands.deleteRange({ from, to });
        updateContextMenu(undefined);
    };

    const handlePaste = async () => {
        if (!editor || isReadOnly) return;
        editor.commands.insertContent(await readClipboardText());
        updateContextMenu(undefined);
    };

    const handleSearchOnWeb = () => {
        if (!editor) return;
        openWebSearch(editor.state.doc.textBetween(from, to, " "));
    };

    return (
        <>
            {hasSelection && <ContextMenuItem text={t("copy")} icon={Copy} action={handleCopy} />}
            {hasSelection && !isReadOnly && <ContextMenuItem text={t("cut")} action={handleCut} />}
            {!isReadOnly && (
                <ContextMenuItem text={t("paste")} icon={hasSelection ? undefined : ClipboardPaste} action={handlePaste} />
            )}
            {hasSelection && (
                <>
                    <ContextMenuSeparator />
                    {!isReadOnly && (
                        <ContextMenuItem text={t("addComment")} icon={MessageSquarePlus} action={onAddComment} />
                    )}
                    <ContextMenuItem text={t("searchOnWeb")} action={handleSearchOnWeb} />
                </>
            )}
        </>
    );
};

/* ============================== */
/*  Spellcheck context menu        */
/* ============================== */

export type SpellcheckContextProps = {
    word: string;
    from: number;
    to: number;
};

const SpellcheckMenu = ({ props }: SubMenuProps<SpellcheckContextProps>) => {
    const t = useTranslations("contextMenu");
    const { editor, repository } = useContext(ProjectContext);
    const { worker } = useSpellcheck();
    const { updateContextMenu } = useContext(UserContext);
    const { word, from, to } = props;
    const [suggestions, setSuggestions] = useState<string[] | null>(null);
    const displaySuggestions = worker ? suggestions : [];

    useEffect(() => {
        if (!worker) return;

        const handler = (e: MessageEvent) => {
            if (e.data.type === "SUGGEST_RESULT" && e.data.word === word) {
                worker.removeEventListener("message", handler);
                setSuggestions(e.data.suggestions);
            }
        };

        worker.addEventListener("message", handler);
        worker.postMessage({ type: "SUGGEST", word });

        return () => worker.removeEventListener("message", handler);
    }, [worker, word]);

    const handleReplace = (suggestion: string) => {
        if (!editor) return;
        const tr = editor.state.tr.replaceWith(from, to, editor.state.schema.text(suggestion));
        editor.view.dispatch(tr);
        updateContextMenu(undefined);
    };

    const handleAddToDictionary = () => {
        if (!editor) return;
        // Save to project-level Yjs dictionary (synced to collaborators).
        // The observer in use-document-editor will pick this up and send ADD_WORD to the worker.
        const projectState = repository?.getState();
        if (projectState) {
            projectState.dictionary().set(word, true);
        } else if (worker) {
            // Fallback: send directly to worker if no project state
            worker.postMessage({ type: "ADD_WORD", word });
            refreshSpellcheck(editor);
        }
        updateContextMenu(undefined);
    };

    return (
        <>
            {displaySuggestions === null && (
                <div className={context.menu_label}>
                    <Loader2 size={14} className={context.spinner} />
                </div>
            )}
            {displaySuggestions !== null && displaySuggestions.length === 0 && (
                <div className={context.menu_label}>
                    <span>{t("noSuggestions")}</span>
                </div>
            )}
            {displaySuggestions?.map((s) => (
                <div key={s} className={context.suggestion_item} onClick={() => handleReplace(s)}>
                    <p className="unselectable">{s}</p>
                </div>
            ))}
            {displaySuggestions !== null && displaySuggestions.length > 0 && <ContextMenuSeparator />}
            <ContextMenuItem text={t("addToDictionary")} icon={BookPlus} action={handleAddToDictionary} />
        </>
    );
};

/* ============================ */
/*  Dual Dialogue context menu  */
/* ============================ */

const DualDialogueMenu = ({ props }: SubMenuProps<{ pos: number }>) => {
    const t = useTranslations("contextMenu");
    const { editor, isReadOnly } = useContext(ProjectContext);
    const { updateContextMenu } = useContext(UserContext);
    const { pos } = props;

    if (isReadOnly) return null;

    return (
        <ContextMenuItem
            text={t("makeDualDialogue")}
            icon={Columns2}
            action={() => {
                if (editor) makeDualDialogue(editor, pos);
                updateContextMenu(undefined);
            }}
        />
    );
};

/* ============================ */
/*  Shelve Node context menu    */
/* ============================ */

const ShelveNodeMenu = ({ props }: SubMenuProps<{ pos: number; nodeClass: string }>) => {
    const t = useTranslations("contextMenu");
    const { editor, repository, isReadOnly } = useContext(ProjectContext);
    const { updateContextMenu } = useContext(UserContext);
    const { pos, nodeClass } = props;

    const handleShelve = () => {
        if (!editor || !repository || isReadOnly) return;
        const candidate = extractShelveCandidate(editor, pos);
        if (candidate) {
            repository.shelveNode(candidate.nodeId, candidate.title, candidate.type, candidate.content);
        }
        updateContextMenu(undefined);
    };

    // Check if dual dialogue is available (Character node followed by valid dialogue pattern)
    const canDualDialogue = (() => {
        if (nodeClass !== ScreenplayElement.Character || !editor) return false;
        const doc = editor.state.doc;
        const $pos = doc.resolve(pos);
        const idx = $pos.index(0);
        const count = doc.childCount;
        let i = idx + 1;
        while (i < count && doc.child(i).attrs.class === ScreenplayElement.Parenthetical) i++;
        if (i >= count || doc.child(i).attrs.class !== ScreenplayElement.Dialogue) return false;
        i++;
        while (i < count) {
            const cls = doc.child(i).attrs.class;
            if (cls === ScreenplayElement.Parenthetical || cls === ScreenplayElement.Dialogue) i++;
            else break;
        }
        return i < count && doc.child(i).attrs.class === ScreenplayElement.Character;
    })();

    const shelveLabel =
        nodeClass === ScreenplayElement.Scene
            ? t("shelveScene")
            : nodeClass === ScreenplayElement.Character
              ? t("shelveDialogue")
              : t("shelveAction");

    if (isReadOnly) return null;

    return (
        <>
            <ContextMenuItem text={shelveLabel} icon={Archive} action={handleShelve} />
            {canDualDialogue && (
                <ContextMenuItem
                    text={t("makeDualDialogue")}
                    action={() => {
                        if (editor) makeDualDialogue(editor, pos);
                        updateContextMenu(undefined);
                    }}
                />
            )}
        </>
    );
};

/* ============================== */
/*  Unified Editor context menu   */
/* ============================== */

export type EditorContextMenuProps = {
    /** The editor that was right-clicked. All actions act on this instance — not
     *  ProjectContext.editor, which is always the main screenplay editor. */
    editor: Editor;
    from: number;
    to: number;
    /** Present when the caret sits on a node a comment can anchor to. */
    onAddComment?: () => void;
    spellError?: { word: string; from: number; to: number };
    nodePos?: number;
    nodeClass?: string;
    /** Present when the caret sits on a scene heading that can be sent to the Outline. */
    outlineScene?: { refDocId: string; refId: string; title: string };
    /** Present on paginated screenplay editors: the top-level block under the
     *  caret (`pos`) and whether it already forces a manual page break. */
    pageBreak?: { pos: number; active: boolean };
};

const EditorContextMenu = ({ props }: SubMenuProps<EditorContextMenuProps>) => {
    const t = useTranslations("contextMenu");
    const { repository, isReadOnly, persistentScenes } = useContext(ProjectContext);
    const { worker } = useSpellcheck();
    const { updateContextMenu } = useContext(UserContext);
    // Act on the editor that was right-clicked (passed through props), NOT
    // ProjectContext.editor — that one is always the main screenplay editor, so
    // using it would misfire actions in the tree-document / draft / title editors.
    const { editor, from, to, onAddComment, spellError, nodePos, nodeClass, outlineScene, pageBreak } = props;
    const hasSelection = from !== to;

    const handleSendToOutline = () => {
        if (!repository || !outlineScene) return;
        repository.addOutlineItem({
            source: "scene",
            refDocId: outlineScene.refDocId,
            refId: outlineScene.refId,
            title: outlineScene.title,
            preview: "",
            parentId: null,
        });
        updateContextMenu(undefined);
    };

    // Resolve scene UUID + lock state if right-clicked on a scene heading.
    // `nodePos` is the cursor position inside the paragraph (from the editor
    // dispatcher), so we resolve up to the depth-1 ancestor — the scene <p>
    // node itself — rather than calling `doc.nodeAt(nodePos)` which would
    // return the inner text node.
    const sceneInfo = (() => {
        if (nodeClass !== ScreenplayElement.Scene || nodePos === undefined || !editor) {
            return null;
        }
        let sceneNode;
        try {
            sceneNode = editor.state.doc.resolve(nodePos).node(1);
        } catch {
            return null;
        }
        if (!sceneNode || sceneNode.attrs?.class !== ScreenplayElement.Scene) return null;
        const uuid: string | undefined = sceneNode.attrs?.["data-id"];
        if (!uuid) return null;
        const entry = persistentScenes[uuid];
        return { uuid, isOmitted: !!entry?.omitted };
    })();

    const handleOmitScene = () => {
        if (!editor || !repository || !sceneInfo) return;
        omitSceneByUuid(editor, repository, sceneInfo.uuid);
        updateContextMenu(undefined);
    };

    const handleUnomitScene = () => {
        if (!editor || !repository || !sceneInfo) return;
        unomitSceneByUuid(editor, repository, sceneInfo.uuid);
        updateContextMenu(undefined);
    };

    const [suggestions, setSuggestions] = useState<string[] | null>(null);
    const displaySuggestions = spellError && !worker ? [] : suggestions;

    useEffect(() => {
        if (!spellError || !worker) return;
        const handler = (e: MessageEvent) => {
            if (e.data.type === "SUGGEST_RESULT" && e.data.word === spellError.word) {
                worker.removeEventListener("message", handler);
                setSuggestions(e.data.suggestions);
            }
        };
        worker.addEventListener("message", handler);
        worker.postMessage({ type: "SUGGEST", word: spellError.word });
        return () => worker.removeEventListener("message", handler);
    }, [worker, spellError]);

    const handleCopy = async () => {
        if (!editor) return;
        await navigator.clipboard.writeText(editor.state.doc.textBetween(from, to, "\n"));
        updateContextMenu(undefined);
    };

    const handleCut = async () => {
        if (!editor || isReadOnly) return;
        await navigator.clipboard.writeText(editor.state.doc.textBetween(from, to, "\n"));
        editor.commands.deleteRange({ from, to });
        updateContextMenu(undefined);
    };

    const handlePaste = async () => {
        if (!editor || isReadOnly) return;
        editor.commands.insertContent(await readClipboardText());
        updateContextMenu(undefined);
    };

    const handleSpellReplace = (suggestion: string) => {
        if (!editor || !spellError || isReadOnly) return;
        const tr = editor.state.tr.replaceWith(spellError.from, spellError.to, editor.state.schema.text(suggestion));
        editor.view.dispatch(tr);
        updateContextMenu(undefined);
    };

    const handleAddToDictionary = () => {
        if (!editor || !spellError) return;
        const projectState = repository?.getState();
        if (projectState) {
            projectState.dictionary().set(spellError.word, true);
        } else if (worker) {
            worker.postMessage({ type: "ADD_WORD", word: spellError.word });
            refreshSpellcheck(editor);
        }
        updateContextMenu(undefined);
    };

    const handleSearchOnWeb = () => {
        if (!editor) return;
        openWebSearch(editor.state.doc.textBetween(from, to, " "));
    };

    const handleShelve = () => {
        if (!editor || !repository || nodePos === undefined || isReadOnly) return;
        const candidate = extractShelveCandidate(editor, nodePos);
        if (candidate) {
            repository.shelveNode(candidate.nodeId, candidate.title, candidate.type, candidate.content);
        }
        updateContextMenu(undefined);
    };

    const handleTogglePageBreak = () => {
        if (!editor || !pageBreak || isReadOnly) return;
        editor.commands.toggleManualPageBreak(pageBreak.pos);
        updateContextMenu(undefined);
    };

    const canDualDialogue = (() => {
        if (nodeClass !== ScreenplayElement.Character || !editor || nodePos === undefined) return false;
        const doc = editor.state.doc;
        const $pos = doc.resolve(nodePos);
        const idx = $pos.index(0);
        const count = doc.childCount;
        let i = idx + 1;
        while (i < count && doc.child(i).attrs.class === ScreenplayElement.Parenthetical) i++;
        if (i >= count || doc.child(i).attrs.class !== ScreenplayElement.Dialogue) return false;
        i++;
        while (i < count) {
            const cls = doc.child(i).attrs.class;
            if (cls === ScreenplayElement.Parenthetical || cls === ScreenplayElement.Dialogue) i++;
            else break;
        }
        return i < count && doc.child(i).attrs.class === ScreenplayElement.Character;
    })();

    const isShelvable =
        nodeClass === ScreenplayElement.Scene ||
        nodeClass === ScreenplayElement.Character ||
        nodeClass === ScreenplayElement.Action;

    return (
        <>
            {/* Spellcheck section — shown first when on a spellcheck error */}
            {spellError && (
                <>
                    {displaySuggestions === null && (
                        <div className={context.menu_label}>
                            <Loader2 size={14} className={context.spinner} />
                        </div>
                    )}
                    {displaySuggestions !== null && displaySuggestions.length === 0 && (
                        <div className={context.menu_label}>
                            <span>{t("noSuggestions")}</span>
                        </div>
                    )}
                    {displaySuggestions?.map((s) => (
                        <div key={s} className={context.suggestion_item} onClick={() => handleSpellReplace(s)}>
                            <p className="unselectable">{s}</p>
                        </div>
                    ))}
                    {!isReadOnly && (
                        <ContextMenuItem text={t("addToDictionary")} icon={BookPlus} action={handleAddToDictionary} />
                    )}
                    <ContextMenuSeparator />
                </>
            )}

            {/* Clipboard — copy is always visible; cut/paste hidden for viewers */}
            {!isReadOnly && (
                <ContextMenuItem text={t("cut")} icon={Scissors} action={handleCut} disabled={!hasSelection} />
            )}
            <ContextMenuItem text={t("copy")} action={handleCopy} disabled={!hasSelection} />
            {!isReadOnly && <ContextMenuItem text={t("paste")} action={handlePaste} />}

            {/* Comment on the node at the caret + search a selection on the web */}
            {!spellError && ((onAddComment && !isReadOnly) || hasSelection) && (
                <>
                    <ContextMenuSeparator />
                    {!isReadOnly && onAddComment && (
                        <ContextMenuItem text={t("addComment")} icon={MessageSquarePlus} action={onAddComment} />
                    )}
                    {hasSelection && (
                        <ContextMenuItem text={t("searchOnWeb")} action={handleSearchOnWeb} />
                    )}
                </>
            )}

            {/* Node actions — shelve and optional dual dialogue */}
            {isShelvable && !isReadOnly && (
                <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        text={
                            nodeClass === ScreenplayElement.Scene
                                ? t("shelveScene")
                                : nodeClass === ScreenplayElement.Character
                                  ? t("shelveDialogue")
                                  : t("shelveAction")
                        }
                        icon={Archive}
                        action={handleShelve}
                    />
                    {canDualDialogue && (
                        <ContextMenuItem
                            text={t("makeDualDialogue")}
                            action={() => {
                                if (editor && nodePos !== undefined) makeDualDialogue(editor, nodePos);
                                updateContextMenu(undefined);
                            }}
                        />
                    )}
                </>
            )}

            {/* Manual page break — force a new page that begins at this block */}
            {pageBreak && !isReadOnly && (
                <>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        text={pageBreak.active ? t("removePageBreak") : t("insertPageBreak")}
                        icon={SeparatorHorizontal}
                        action={handleTogglePageBreak}
                    />
                </>
            )}

            {/* Send a scene heading to the Outline */}
            {outlineScene && !isReadOnly && (
                <>
                    <ContextMenuSeparator />
                    <ContextMenuItem text={t("sendToOutline")} icon={ListTree} action={handleSendToOutline} />
                </>
            )}

            {/* Production: Omit / Unomit on a locked scene heading */}
            {sceneInfo && !isReadOnly && (
                <>
                    <ContextMenuSeparator />
                    {sceneInfo.isOmitted ? (
                        <ContextMenuItem
                            text={t("unomitScene")}
                            icon={Eye}
                            action={handleUnomitScene}
                        />
                    ) : (
                        <ContextMenuItem
                            text={t("omitScene")}
                            icon={EyeOff}
                            action={handleOmitScene}
                        />
                    )}
                </>
            )}
        </>
    );
};

const renderContextMenu = (contextMenu: ContextMenuProps) => {
    if ("content" in contextMenu) return contextMenu.content;
    switch (contextMenu.type) {
        case ContextMenuType.SceneList:
            return <SceneListMenu />;
        case ContextMenuType.SceneItem:
            return <SceneItemMenu props={contextMenu.typeSpecificProps as SceneContextProps} />;
        case ContextMenuType.CharacterList:
            return <CharacterListMenu />;
        case ContextMenuType.CharacterItem:
            return <CharacterItemMenu props={contextMenu.typeSpecificProps as CharacterContextProps} />;
        case ContextMenuType.LocationItem:
            return <LocationItemMenu props={contextMenu.typeSpecificProps as LocationContextProps} />;
        case ContextMenuType.EditorSelection:
            return <EditorSelectionMenu props={contextMenu.typeSpecificProps as EditorSelectionContextProps} />;
        case ContextMenuType.Spellcheck:
            return <SpellcheckMenu props={contextMenu.typeSpecificProps as SpellcheckContextProps} />;
        case ContextMenuType.DualDialogue:
            return <DualDialogueMenu props={contextMenu.typeSpecificProps as { pos: number }} />;
        case ContextMenuType.ShelveNode:
            return <ShelveNodeMenu props={contextMenu.typeSpecificProps as { pos: number; nodeClass: string }} />;
        case ContextMenuType.EditorContextMenu:
            return <EditorContextMenu props={contextMenu.typeSpecificProps as EditorContextMenuProps} />;
    }
};

const ContextMenu = () => {
    const { contextMenu, updateContextMenu } = useContext(UserContext);

    const handleClick = () => {
        if (contextMenu) updateContextMenu(undefined);
    };

    useEffect(() => {
        addEventListener("click", handleClick, false);
        return () => {
            removeEventListener("click", handleClick, false);
        };
    });

    useEffect(() => {
        if (!contextMenu) return;
        const prevent = (e: WheelEvent) => e.preventDefault();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") updateContextMenu(undefined);
        };
        document.addEventListener("wheel", prevent, { passive: false });
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("wheel", prevent);
            document.removeEventListener("keydown", onKey);
        };
    }, [contextMenu, updateContextMenu]);

    useEffect(() => {
        updateContextMenu(undefined);
    }, [updateContextMenu]);

    if (!contextMenu) return null;

    return (
        <ContextMenuSurface position={contextMenu.position}>
            {renderContextMenu(contextMenu)}
        </ContextMenuSurface>
    );
};

export default ContextMenu;
