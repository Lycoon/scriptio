"use client";

import { useContext, useEffect, useState } from "react";
import { UserContext } from "@src/context/UserContext";
import { useSpellcheck } from "@src/context/SpellcheckContext";
import { refreshSpellcheck } from "@src/lib/spellcheck/spellcheck-extension";
import { Scene } from "@src/lib/screenplay/scenes";

import context from "./ContextMenu.module.css";
import { CharacterData, deleteCharacter } from "@src/lib/screenplay/characters";
import { LocationData, deleteLocation } from "@src/lib/screenplay/locations";
import { copyText, cutText, focusOnPosition, pasteText, selectTextInEditor } from "@src/lib/screenplay/editor";
import { addCharacterPopup, editCharacterPopup, editScenePopup } from "@src/lib/screenplay/popup";
import { ProjectContext } from "@src/context/ProjectContext";
import { useTranslations } from "next-intl";
import {
    ArrowDownRight,
    BookPlus,
    ClipboardPaste,
    Columns2,
    Highlighter,
    Loader2,
    LucideIcon,
    MessageSquarePlus,
    Pencil,
    Scissors,
    Search,
    SquareDashedMousePointer,
    Trash2,
    UserRound,
} from "lucide-react";
import { makeDualDialogue } from "@src/lib/screenplay/dual-dialogue";

/* ==================== */
/*     Context menu     */
/* ==================== */

export type ContextMenuProps = {
    type: ContextMenuType;
    position: { x: number; y: number };
    typeSpecificProps: any;
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
}

type ContextMenuItemProps = {
    text: string;
    action: () => void;
    icon: LucideIcon;
};

export const ContextMenuItem = ({ text, action, icon: Icon }: ContextMenuItemProps) => {
    return (
        <div onClick={action} className={context.menu_item}>
            <Icon size={16} />
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

const SceneItemMenu = (props: any) => {
    const t = useTranslations("contextMenu");
    const userCtx = useContext(UserContext);
    const { editor } = useContext(ProjectContext);
    const scene: Scene = props.props.scene;

    return (
        <>
            <ContextMenuItem
                text={t("goToScene")}
                icon={ArrowDownRight}
                action={() => focusOnPosition(editor!, scene.position)}
            />
            <ContextMenuItem text={t("edit")} icon={Pencil} action={() => editScenePopup(scene, userCtx)} />
            <ContextMenuItem
                text={t("cut")}
                icon={Scissors}
                action={() => cutText(editor!, scene.position, scene.nextPosition)}
            />
            <ContextMenuItem
                text={t("selectInEditor")}
                icon={SquareDashedMousePointer}
                action={() => selectTextInEditor(editor!, scene.position, scene.nextPosition)}
            />
        </>
    );
};

const SceneListMenu = (props: any) => {
    const title = props.props.title;

    const addScene = () => {
        console.log("add scene ", name);
    };

    return <></>;
    //return <>{<ContextMenuItem text={"Add scene"} action={addScene} />}</>;
};

/* ======================== */
/*  Character context menu  */
/* ======================== */

export type CharacterContextProps = {
    character: CharacterData;
};

const CharacterItemMenu = (props: any) => {
    const t = useTranslations("contextMenu");
    const userCtx = useContext(UserContext);
    const projectCtx = useContext(ProjectContext);
    const { toggleCharacterHighlight } = projectCtx;
    const character: CharacterData = props.props.character;

    return (
        <>
            <ContextMenuItem text={t("edit")} icon={Pencil} action={() => editCharacterPopup(character, userCtx)} />
            <ContextMenuItem text={t("remove")} icon={Trash2} action={() => deleteCharacter(character.name, projectCtx)} />
            <ContextMenuItem
                text={t("paste")}
                icon={ClipboardPaste}
                action={() => pasteText(projectCtx.editor!, character.name)}
            />
            <ContextMenuItem
                text={t("highlight")}
                icon={Highlighter}
                action={() => toggleCharacterHighlight(character.name)}
            />
        </>
    );
};

const CharacterListMenu = (props: any) => {
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

const LocationItemMenu = (props: any) => {
    const t = useTranslations("contextMenu");
    const projectCtx = useContext(ProjectContext);
    const location: LocationData = props.props.location;

    return (
        <>
            <ContextMenuItem icon={Trash2} text={t("remove")} action={() => deleteLocation(location.name, projectCtx)} />
            <ContextMenuItem
                icon={ClipboardPaste}
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

const EditorSelectionMenu = (props: any) => {
    const t = useTranslations("contextMenu");
    const projectCtx = useContext(ProjectContext);
    const { editor } = projectCtx;
    const { from, to, onAddComment } = props.props as EditorSelectionContextProps;

    const handleSearchOnWeb = () => {
        if (!editor) return;
        const selectedText = editor.state.doc.textBetween(from, to, " ");
        if (!selectedText.trim()) return;
        window.open(`https://www.google.com/search?q=${encodeURIComponent(selectedText)}`, "_blank");
    };

    return (
        <>
            <ContextMenuItem text={t("addComment")} icon={MessageSquarePlus} action={onAddComment} />
            <ContextMenuItem text={t("searchOnWeb")} icon={Search} action={handleSearchOnWeb} />
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

const SpellcheckMenu = (props: any) => {
    const t = useTranslations("contextMenu");
    const { editor, repository } = useContext(ProjectContext);
    const { worker } = useSpellcheck();
    const { updateContextMenu } = useContext(UserContext);
    const { word, from, to } = props.props as SpellcheckContextProps;
    const [suggestions, setSuggestions] = useState<string[] | null>(null);

    useEffect(() => {
        if (!worker) {
            setSuggestions([]);
            return;
        }

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
            {suggestions === null && (
                <div className={context.menu_label}>
                    <Loader2 size={14} className={context.spinner} />
                </div>
            )}
            {suggestions !== null && suggestions.length === 0 && (
                <div className={context.menu_label}>
                    <span>{t("noSuggestions")}</span>
                </div>
            )}
            {suggestions?.map((s) => (
                <div key={s} className={context.suggestion_item} onClick={() => handleReplace(s)}>
                    <p className="unselectable">{s}</p>
                </div>
            ))}
            <ContextMenuItem text={t("addToDictionary")} icon={BookPlus} action={handleAddToDictionary} />
        </>
    );
};

/* ============================ */
/*  Dual Dialogue context menu  */
/* ============================ */

const DualDialogueMenu = (props: any) => {
    const t = useTranslations("contextMenu");
    const { editor } = useContext(ProjectContext);
    const { updateContextMenu } = useContext(UserContext);
    const { pos } = props.props as { pos: number };

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

const renderContextMenu = (contextMenu: ContextMenuProps) => {
    switch (contextMenu.type) {
        case ContextMenuType.SceneList:
            return <SceneListMenu props={contextMenu.typeSpecificProps} />;
        case ContextMenuType.SceneItem:
            return <SceneItemMenu props={contextMenu.typeSpecificProps} />;
        case ContextMenuType.CharacterList:
            return <CharacterListMenu props={contextMenu.typeSpecificProps} />;
        case ContextMenuType.CharacterItem:
            return <CharacterItemMenu props={contextMenu.typeSpecificProps} />;
        case ContextMenuType.LocationItem:
            return <LocationItemMenu props={contextMenu.typeSpecificProps} />;
        case ContextMenuType.EditorSelection:
            return <EditorSelectionMenu props={contextMenu.typeSpecificProps} />;
        case ContextMenuType.Spellcheck:
            return <SpellcheckMenu props={contextMenu.typeSpecificProps} />;
        case ContextMenuType.DualDialogue:
            return <DualDialogueMenu props={contextMenu.typeSpecificProps} />;
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
        updateContextMenu(undefined);
    }, []);

    return (
        <div
            className={context.menu}
            style={{
                top: contextMenu?.position.y,
                left: contextMenu?.position.x,
            }}
        >
            {contextMenu && renderContextMenu(contextMenu)}
        </div>
    );
};

export default ContextMenu;
