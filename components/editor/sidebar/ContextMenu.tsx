import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../../src/context/UserContext";
import { CharacterData, CharacterItem } from "../../../src/lib/screenplayUtils";

type ContextMenuItemProps = {
    text: string;
    action: () => void;
};

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
}

export type SceneContextProps = {
    title: string;
    position: number;
    nextPosition: number;
    focusOn: (position: number) => void;
    selectTextInEditor: (start: number, end: number) => void;
    cutTextSelection: (start: number, end: number) => void;
    copyTextSelection: (start: number, end: number) => void;
};

export type CharacterContextProps = {
    character: CharacterData;
    pasteText: (text: string) => void;
    editCharacterPopup: (character: CharacterData) => void;
    removeCharacter: (name: string) => void;
};

const ContextMenuItem = ({ text, action }: ContextMenuItemProps) => {
    return (
        <div onClick={action} className="context-menu-item">
            <p className="unselectable">{text}</p>
        </div>
    );
};

const SceneItemContextMenu = (props: any) => {
    const focusOn = props.props.focusOn;
    const selectTextInEditor = props.props.selectTextInEditor;
    const cutTextSelection = props.props.cutTextSelection;
    const copyTextSelection = props.props.copyTextSelection;
    const position = props.props.position;
    const nextPosition = props.props.nextPosition;

    const goToScene = () => {
        focusOn(position);
    };
    const copyScene = () => {
        copyTextSelection(position, nextPosition);
    };
    const cutScene = () => {
        cutTextSelection(position, nextPosition);
    };
    const selectScene = () => {
        selectTextInEditor(position, nextPosition);
    };

    return (
        <>
            <ContextMenuItem text={"Go to scene"} action={goToScene} />
            <ContextMenuItem text={"Copy"} action={copyScene} />
            <ContextMenuItem text={"Cut"} action={cutScene} />
            <ContextMenuItem text={"Select in editor"} action={selectScene} />
        </>
    );
};

const CharacterItemContextMenu = (props: any) => {
    const character: CharacterData = props.props.character;
    const pasteText = props.props.pasteText;
    const editCharacterPopup = props.props.editCharacterPopup;
    const removeCharacter = props.props.removeCharacter;

    const _editCharacterPopup = () => {
        editCharacterPopup(character);
    };
    const _removeCharacter = () => {
        removeCharacter(character.name);
    };
    const _pasteText = () => {
        pasteText(character.name);
    };

    return (
        <>
            <ContextMenuItem text={"Edit"} action={_editCharacterPopup} />
            <ContextMenuItem text={"Remove"} action={_removeCharacter} />
            <ContextMenuItem text={"Paste"} action={_pasteText} />
        </>
    );
};

const CharacterListContextMenu = (props: any) => {
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

const SceneListContextMenu = (props: any) => {
    const title = props.props.title;

    const addScene = () => {
        console.log("add scene ", name);
    };

    return (
        <>
            <ContextMenuItem text={"Add scene"} action={addScene} />
        </>
    );
};

const ContextMenu = () => {
    const { contextMenu, updateContextMenu } = useContext(UserContext);
    const type = contextMenu?.type;

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
            className={"context-menu"}
            style={{
                top: contextMenu?.position.y,
                left: contextMenu?.position.x,
            }}
        >
            {contextMenu && type === ContextMenuType.SceneItem && (
                <SceneItemContextMenu props={contextMenu?.typeSpecificProps} />
            )}
            {contextMenu && type === ContextMenuType.CharacterItem && (
                <CharacterItemContextMenu props={contextMenu?.typeSpecificProps} />
            )}
            {contextMenu && type === ContextMenuType.SceneList && (
                <SceneListContextMenu props={contextMenu?.typeSpecificProps} />
            )}
            {contextMenu && type === ContextMenuType.CharacterList && (
                <CharacterListContextMenu props={contextMenu?.typeSpecificProps} />
            )}
        </div>
    );
};

export default ContextMenu;
