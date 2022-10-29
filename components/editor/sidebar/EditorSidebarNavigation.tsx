import { useEffect, useState } from "react";
import {
    getScenesData,
    SceneItem,
    ScenesData,
} from "../../../src/lib/screenplayUtils";
import SidebarSceneItem from "./SidebarSceneItem";

type Props = {
    active: boolean;
    getFocusOnPosition: (position: number) => void;
    selectTextInEditor: (start: number, end: number) => void;
    cutTextSelection: (start: number, end: number) => void;
};

const EditorSidebarNavigation = ({
    active,
    getFocusOnPosition,
    selectTextInEditor,
    cutTextSelection,
}: Props) => {
    const isActive = active ? "navigation-on" : "";
    const [scenes, setScenes] = useState<ScenesData>(getScenesData());
    const characters: any[] = [];

    useEffect(() => {
        setScenes(getScenesData());
    }, [getScenesData()]);

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
                            <SidebarSceneItem
                                title={character.name}
                                position={0}
                                nextPosition={-1}
                                focusOn={getFocusOnPosition}
                                selectTextInEditor={selectTextInEditor}
                            />
                        );
                    })}
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
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarNavigation;
