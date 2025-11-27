import { useContext, useEffect } from "react";
import { UserContext } from "@src/context/UserContext";
import { SceneItem } from "@src/lib/editor/screenplay";

import context from "./ContextMenu.module.css";
import { CharacterData, deleteCharacter } from "@src/lib/editor/characters";
import { copyText, cutText, focusOnPosition, pasteText, selectTextInEditor } from "@src/lib/editor/editor";
import { addCharacterPopup, editCharacterPopup } from "@src/lib/editor/popup";
import { ProjectContext } from "@src/context/ProjectContext";

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
}

type ContextMenuItemProps = {
    text: string;
    action: () => void;
};

export const ContextMenuItem = ({ text, action }: ContextMenuItemProps) => {
    return (
        <div onClick={action} className={context.menu_item}>
            <p className="unselectable">{text}</p>
        </div>
    );
};

/* ========================== */
/*     Scene context menu     */
/* ========================== */

export type SceneContextProps = {
    scene: SceneItem;
};

const SceneItemMenu = (props: any) => {
    const { screenplayEditor } = useContext(ProjectContext);

    const position = props.props.position;
    const nextPosition = props.props.nextPosition;

    return (
        <>
            <ContextMenuItem text={"Go to scene"} action={() => focusOnPosition(screenplayEditor!, position)} />
            <ContextMenuItem text={"Cut"} action={() => cutText(screenplayEditor!, position, nextPosition)} />
            <ContextMenuItem
                text={"Select in editor"}
                action={() => selectTextInEditor(screenplayEditor!, position, nextPosition)}
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
    return <>{<ContextMenuItem text={"Add scene"} action={addScene} />}</>;
};

/* ======================== */
/*  Character context menu  */
/* ======================== */

export type CharacterContextProps = {
    character: CharacterData;
};

const CharacterItemMenu = (props: any) => {
    const userCtx = useContext(UserContext);
    const projectCtx = useContext(ProjectContext);
    const character: CharacterData = props.props.character;

    return (
        <>
            <ContextMenuItem text={"Edit"} action={() => editCharacterPopup(character, userCtx)} />
            <ContextMenuItem text={"Remove"} action={() => deleteCharacter(character.name, projectCtx)} />
            <ContextMenuItem text={"Paste"} action={() => pasteText(projectCtx.screenplayEditor!, character.name)} />
        </>
    );
};

const CharacterListMenu = (props: any) => {
    const userCtx = useContext(UserContext);
    return <ContextMenuItem text={"Add character"} action={() => addCharacterPopup(userCtx)} />;
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
