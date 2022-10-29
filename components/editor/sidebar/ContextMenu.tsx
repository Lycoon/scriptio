import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../../src/context/UserContext";

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
    Scene,
    Character,
    Location,
}

export type SceneContextProps = {
    title: string;
    position: number;
    focusOn: (position: number) => void;
};

const ContextMenuItem = ({ text, action }: ContextMenuItemProps) => {
    return (
        <div onClick={action} className="context-menu-item">
            <p className="unselectable">{text}</p>
        </div>
    );
};

const SceneContextMenu = (props: any) => {
    const focusOn = props.props.focusOn;
    const position = props.props.position;
    const nextPosition = props.props.nextPosition;

    const goToScene = () => {
        focusOn(position);
    };
    const copyScene = () => {
        console.log("copy scene ", position);
    };
    const cutScene = () => {
        console.log("cut scene ", position);
    };
    const selectScene = () => {
        console.log("select scene ", position);
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

const ContextMenu = () => {
    const { contextMenu, updateContextMenu } = useContext(UserContext);
    const [visible, setVisible] = useState<boolean>(contextMenu !== undefined);
    const type = contextMenu?.type;
    //console.log("context menu", contextMenu);

    const handleClick = () => {
        if (visible) setVisible(false);
    };

    useEffect(() => {
        addEventListener("click", handleClick, false);
        return () => {
            removeEventListener("click", handleClick, false);
        };
    });

    useEffect(() => {
        setVisible(contextMenu !== undefined);
    }, [contextMenu]);

    return (
        <div
            className={"context-menu"}
            style={{
                top: contextMenu?.position.y,
                left: contextMenu?.position.x,
            }}
        >
            {visible && type === ContextMenuType.Scene && (
                <SceneContextMenu props={contextMenu?.typeSpecificProps} />
            )}
        </div>
    );
};

export default ContextMenu;
