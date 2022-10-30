import { useContext, useEffect, useState } from "react";
import { UserContext } from "../../../src/context/UserContext";
import {
    CharactersData,
    getScenesData,
    SceneItem,
    ScenesData,
} from "../../../src/lib/screenplayUtils";
import { ContextMenuType } from "./ContextMenu";
import SidebarCharacterItem from "./SidebarCharacterItem";
import SidebarSceneItem from "./SidebarSceneItem";

type Props = {
    active: boolean;
    getFocusOnPosition: (position: number) => void;
    selectTextInEditor: (start: number, end: number) => void;
    cutTextSelection: (start: number, end: number) => void;
    pasteText: (text: string) => void;
    replaceOccurrences: (text: string, replace: string) => void;
};

const EditorSidebarNavigation = ({
    active,
    getFocusOnPosition,
    selectTextInEditor,
    cutTextSelection,
    pasteText,
    replaceOccurrences,
}: Props) => {
    const { updateContextMenu } = useContext(UserContext);
    const [scenes, setScenes] = useState<ScenesData>(getScenesData());
    const [characters, setCharacters] = useState<CharactersData>([]);
    const isActive = active ? "navigation-on" : "";

    useEffect(() => {
        setScenes(getScenesData());
    }, [getScenesData()]);

    const handleDropdownSceneList = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.SceneList,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {},
        });
    };

    const handleDropdownCharacterList = (e: any) => {
        e.preventDefault();
        updateContextMenu({
            type: ContextMenuType.CharacterList,
            position: { x: e.clientX, y: e.clientY },
            typeSpecificProps: {},
        });
    };

    return (
        <div className={`navigation-sidebar ${isActive}`}>
            <div>
                <div className="sidebar-selection">
                    <p className="scene-list-title selected">Characters</p>
                    <p className="scene-list-title">Locations</p>
                    <p className="scene-list-title">Others</p>
                </div>
                <div className="scene-list">
                    {characters.map((character: any) => {
                        return (
                            <SidebarCharacterItem
                                name={character.name}
                                pasteText={pasteText}
                                replaceOccurrences={replaceOccurrences}
                            />
                        );
                    })}
                    <div
                        className="scene-list-fill"
                        onContextMenu={handleDropdownCharacterList}
                    ></div>
                </div>
            </div>
            <div>
                <p className="scene-list-title">Scenes</p>
                <div className="scene-list">
                    {scenes.map((scene: SceneItem) => {
                        return (
                            <SidebarSceneItem
                                key={scene.position}
                                title={scene.title}
                                position={scene.position}
                                nextPosition={scene.nextPosition}
                                focusOn={getFocusOnPosition}
                                selectTextInEditor={selectTextInEditor}
                                cutTextSelection={cutTextSelection}
                            />
                        );
                    })}
                    <div
                        className="scene-list-fill"
                        onContextMenu={handleDropdownSceneList}
                    ></div>
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarNavigation;
