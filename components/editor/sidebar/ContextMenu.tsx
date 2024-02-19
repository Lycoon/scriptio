import { useContext, useEffect } from "react";
import { UserContext } from "@src/context/UserContext";
import { SceneItem } from "@src/lib/editor/screenplay";

import context from "./ContextMenu.module.css";
import { CharacterData } from "@src/lib/editor/characters";
import { copyText, cutText, focusOnPosition, pasteText, selectTextInEditor } from "@src/lib/editor/editor";

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
    const { editor } = useContext(UserContext);

    const position = props.props.position;
    const nextPosition = props.props.nextPosition;

    const goToScene = () => {
        focusOnPosition(editor!, position);
    };
    const copyScene = () => {
        copyText(editor!, position, nextPosition);
    };
    const cutScene = () => {
        cutText(editor!, position, nextPosition);
    };
    const selectScene = () => {
        selectTextInEditor(editor!, position, nextPosition);
    };

    return (
        <>
            <ContextMenuItem text={"Go to scene"} action={goToScene} />
            <ContextMenuItem text={"Cut"} action={cutScene} />
            <ContextMenuItem text={"Select in editor"} action={selectScene} />
        </>
    );
    return (
        <>
            <ContextMenuItem text={"Go to scene"} action={goToScene} />
            <ContextMenuItem text={"Copy"} action={copyScene} />
            <ContextMenuItem text={"Cut"} action={cutScene} />
            <ContextMenuItem text={"Select in editor"} action={selectScene} />
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
    editCharacterPopup: (character: CharacterData) => void;
    removeCharacter: (name: string) => void;
};

const CharacterItemMenu = (props: any) => {
    const { editor } = useContext(UserContext);

    const character: CharacterData = props.props.character;
    const editCharacterPopup = props.props.editCharacterPopup;
    const removeCharacter = props.props.removeCharacter;

    const _editCharacterPopup = () => {
        editCharacterPopup(character);
    };
    const _removeCharacter = () => {
        removeCharacter(character.name);
    };
    const pasteTextAction = () => {
        pasteText(editor!, character.name);
    };

    return (
        <>
            <ContextMenuItem text={"Edit"} action={_editCharacterPopup} />
            <ContextMenuItem text={"Remove"} action={_removeCharacter} />
            <ContextMenuItem text={"Paste"} action={pasteTextAction} />
        </>
    );
};

const CharacterListMenu = (props: any) => {
    const addCharacterPopup = props.props.addCharacterPopup;

    const _addCharacterPopup = () => {
        addCharacterPopup();
    };

    return (
        <>
            <ContextMenuItem text={"Add character"} action={_addCharacterPopup} />
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
