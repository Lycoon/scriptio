"use client";

import { useContext, useEffect, useState } from "react";
import { UserContext } from "@src/context/UserContext";
import { useSpellcheck } from "@src/context/SpellcheckContext";
import { refreshSpellcheck } from "@src/lib/spellcheck/spellcheck-extension";
import { Scene } from "@src/lib/screenplay/scenes";

import context from "./ContextMenu.module.css";
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
    Highlighter,
    Loader2,
    LucideIcon,
    MessageSquarePlus,
    Pencil,
    Scissors,
    Trash2,
    UserRound,
} from "lucide-react";
import { makeDualDialogue } from "@src/lib/screenplay/dual-dialogue";
import { extractShelveCandidate } from "@src/lib/shelf/shelf-utils";
import { ScreenplayElement } from "@src/lib/utils/enums";

/* ==================== */
/*     Context menu     */
/* ==================== */

export type ContextMenuProps = {
    type: ContextMenuType;
    position: { x: number; y: number };
    typeSpecificProps: unknown;
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

type ContextMenuItemProps = {
    text: string;
    action: () => void;
    icon?: LucideIcon;
    disabled?: boolean;
};

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

export const ContextMenuItem = ({ text, action, icon: Icon, disabled }: ContextMenuItemProps) => {
    return (
        <div onClick={disabled ? undefined : action} className={disabled ? context.menu_item_disabled : context.menu_item}>
            <span className={context.menu_item_icon}>{Icon && <Icon size={16} />}</span>
            <p className="unselectable">{text}</p>
        </div>
    );
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
    const { editor } = useContext(ProjectContext);
    const scene: Scene = props.scene;

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
            <div className={context.menu_separator} />
            <ContextMenuItem text={t("edit")} icon={Pencil} action={() => editScenePopup(scene, userCtx)} />
            <ContextMenuItem
                text={t("cut")}
                action={() => cutText(editor!, scene.position, scene.nextPosition)}
            />
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
    const { toggleCharacterHighlight } = projectCtx;
    const character: CharacterData = props.character;

    return (
        <>
            <ContextMenuItem text={t("edit")} icon={Pencil} action={() => editCharacterPopup(character, userCtx)} />
            <ContextMenuItem text={t("remove")} action={() => deleteCharacter(character.name, projectCtx)} />
            <ContextMenuItem
                text={t("paste")}
                action={() => pasteText(projectCtx.editor!, character.name)}
            />
            <div className={context.menu_separator} />
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
    const location: LocationData = props.location;

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
    const { editor } = projectCtx;
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
        if (!editor) return;
        const text = editor.state.doc.textBetween(from, to, "\n");
        await navigator.clipboard.writeText(text);
        editor.commands.deleteRange({ from, to });
        updateContextMenu(undefined);
    };

    const handlePaste = async () => {
        if (!editor) return;
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
            {hasSelection && <ContextMenuItem text={t("cut")} action={handleCut} />}
            <ContextMenuItem text={t("paste")} icon={hasSelection ? undefined : ClipboardPaste} action={handlePaste} />
            {hasSelection && (
                <>
                    <div className={context.menu_separator} />
                    <ContextMenuItem text={t("addComment")} icon={MessageSquarePlus} action={onAddComment} />
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
            {displaySuggestions !== null && displaySuggestions.length > 0 && <div className={context.menu_separator} />}
            <ContextMenuItem text={t("addToDictionary")} icon={BookPlus} action={handleAddToDictionary} />
        </>
    );
};

/* ============================ */
/*  Dual Dialogue context menu  */
/* ============================ */

const DualDialogueMenu = ({ props }: SubMenuProps<{ pos: number }>) => {
    const t = useTranslations("contextMenu");
    const { editor } = useContext(ProjectContext);
    const { updateContextMenu } = useContext(UserContext);
    const { pos } = props;

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
    const { editor, repository } = useContext(ProjectContext);
    const { updateContextMenu } = useContext(UserContext);
    const { pos, nodeClass } = props;

    const handleShelve = () => {
        if (!editor || !repository) return;
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
    from: number;
    to: number;
    onAddComment: () => void;
    spellError?: { word: string; from: number; to: number };
    nodePos?: number;
    nodeClass?: string;
};

const EditorContextMenu = ({ props }: SubMenuProps<EditorContextMenuProps>) => {
    const t = useTranslations("contextMenu");
    const { editor, repository } = useContext(ProjectContext);
    const { worker } = useSpellcheck();
    const { updateContextMenu } = useContext(UserContext);
    const { from, to, onAddComment, spellError, nodePos, nodeClass } = props;
    const hasSelection = from !== to;

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
        if (!editor) return;
        await navigator.clipboard.writeText(editor.state.doc.textBetween(from, to, "\n"));
        editor.commands.deleteRange({ from, to });
        updateContextMenu(undefined);
    };

    const handlePaste = async () => {
        if (!editor) return;
        editor.commands.insertContent(await readClipboardText());
        updateContextMenu(undefined);
    };

    const handleSpellReplace = (suggestion: string) => {
        if (!editor || !spellError) return;
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
        if (!editor || !repository || nodePos === undefined) return;
        const candidate = extractShelveCandidate(editor, nodePos);
        if (candidate) {
            repository.shelveNode(candidate.nodeId, candidate.title, candidate.type, candidate.content);
        }
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
                    <ContextMenuItem text={t("addToDictionary")} icon={BookPlus} action={handleAddToDictionary} />
                    <div className={context.menu_separator} />
                </>
            )}

            {/* Clipboard — always visible */}
            <ContextMenuItem text={t("cut")} icon={Scissors} action={handleCut} disabled={!hasSelection} />
            <ContextMenuItem text={t("copy")} action={handleCopy} disabled={!hasSelection} />
            <ContextMenuItem text={t("paste")} action={handlePaste} />

            {/* Selection actions — only when there's a selection and no spellcheck error */}
            {hasSelection && !spellError && (
                <>
                    <div className={context.menu_separator} />
                    <ContextMenuItem text={t("addComment")} icon={MessageSquarePlus} action={onAddComment} />
                    <ContextMenuItem text={t("searchOnWeb")} action={handleSearchOnWeb} />
                </>
            )}

            {/* Node actions — shelve and optional dual dialogue */}
            {isShelvable && (
                <>
                    <div className={context.menu_separator} />
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
        </>
    );
};

const renderContextMenu = (contextMenu: ContextMenuProps) => {
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
        document.addEventListener("wheel", prevent, { passive: false });
        return () => document.removeEventListener("wheel", prevent);
    }, [contextMenu]);

    useEffect(() => {
        updateContextMenu(undefined);
    }, [updateContextMenu]);

    if (!contextMenu) return null;

    return (
        <div
            className={context.menu}
            style={{
                top: contextMenu.position.y,
                left: contextMenu.position.x,
            }}
        >
            {renderContextMenu(contextMenu)}
        </div>
    );
};

export default ContextMenu;
