"use client";

import { useContext, useEffect } from "react";
import { UserContext } from "@src/context/UserContext";
import { Scene } from "@src/lib/screenplay/scenes";

import context from "./ContextMenu.module.css";
import { CharacterData, deleteCharacter } from "@src/lib/screenplay/characters";
import { LocationData, deleteLocation } from "@src/lib/screenplay/locations";
import { copyText, cutText, focusOnPosition, pasteText, selectTextInEditor } from "@src/lib/screenplay/editor";
import { addCharacterPopup, editCharacterPopup, editScenePopup } from "@src/lib/screenplay/popup";
import { ProjectContext } from "@src/context/ProjectContext";
import { useUser } from "@src/lib/utils/hooks";
import { useTranslations } from "next-intl";
import {
    ArrowDownRight,
    ClipboardPaste,
    Highlighter,
    LucideIcon,
    MessageSquarePlus,
    Pencil,
    Scissors,
    Search,
    SquareDashedMousePointer,
    Trash2,
    UserRound,
} from "lucide-react";

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
};

const EditorSelectionMenu = (props: any) => {
    const t = useTranslations("contextMenu");
    const projectCtx = useContext(ProjectContext);
    const { repository, editor, setActiveCommentId } = projectCtx;
    const { from, to } = props.props as EditorSelectionContextProps;
    const { user } = useUser();

    const handleAddComment = () => {
        if (!repository || !editor) return;

        const commentId = repository.addComment({
            text: "",
            author: user?.username || "Anonymous",
            createdAt: Date.now(),
            resolved: false,
            replies: [],
        });

        // Restore the original selection (lost when clicking the context menu) and apply the mark
        editor.chain().setTextSelection({ from, to }).setComment(commentId).run();
        setActiveCommentId(commentId);
    };

    const handleSearchOnWeb = () => {
        if (!editor) return;
        const selectedText = editor.state.doc.textBetween(from, to, " ");
        if (!selectedText.trim()) return;
        window.open(`https://www.google.com/search?q=${encodeURIComponent(selectedText)}`, "_blank");
    };

    return (
        <>
            <ContextMenuItem text={t("addComment")} icon={MessageSquarePlus} action={handleAddComment} />
            <ContextMenuItem text={t("searchOnWeb")} icon={Search} action={handleSearchOnWeb} />
        </>
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
