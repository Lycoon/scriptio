import { useContext, useEffect } from "react";
import { UserContext } from "../../../src/context/UserContext";
import { CharacterData, SceneItem } from "../../../src/lib/screenplayUtils";
import styles from "./ContextMenu.module.css";

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
    Suggestion,
}

export type SceneContextProps = {
    scene: SceneItem;
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

export const ContextMenuItem = ({ text, action }: ContextMenuItemProps) => {
    return (
        <div onClick={action} className={styles.menu_item}>
            <p className="unselectable">{text}</p>
        </div>
    );
};

const SceneItemMenu = (props: any) => {
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

const CharacterItemMenu = (props: any) => {
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

const SceneListMenu = (props: any) => {
    const title = props.props.title;

    const addScene = () => {
        console.log("add scene ", name);
    };

    return <></>;
    return <>{<ContextMenuItem text={"Add scene"} action={addScene} />}</>;
};

const getContextMenu = (type: ContextMenuType | undefined, props: any) => {
    switch (type) {
        case ContextMenuType.SceneList:
            return <SceneListMenu props={props} />;
        case ContextMenuType.SceneItem:
            return <SceneItemMenu props={props} />;
        case ContextMenuType.CharacterList:
            return <CharacterListMenu props={props} />;
        case ContextMenuType.CharacterItem:
            return <CharacterItemMenu props={props} />;
    }
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
            className={styles.menu}
            style={{
                top: contextMenu?.position.y,
                left: contextMenu?.position.x,
            }}
        >
            {contextMenu && getContextMenu(type, contextMenu.typeSpecificProps)}
        </div>
    );
};

export default ContextMenu;
