import SidebarSceneItem from "./SidebarSceneItem";

type Props = {
    active: boolean;
};

const EditorSidebarNavigation = ({ active }: Props) => {
    const isActive = active ? "navigation-on" : "";
    console.log(isActive);

    return (
        <div className={`sidebar navigation-sidebar ${isActive}`}>
            <div>
                <div className="sidebar-selection">
                    <p className="scene-list-title selected">Characters</p>
                    <p className="scene-list-title">Locations</p>
                    <p className="scene-list-title">Others</p>
                </div>
                <div className="scene-list">
                    <SidebarSceneItem title="Hugo" />
                    <SidebarSceneItem title="Axel" />
                    <SidebarSceneItem title="Erwan" />
                    <SidebarSceneItem title="Vahan" />
                </div>
            </div>
            <div>
                <p className="scene-list-title">Scenes</p>
                <div className="scene-list">
                    <SidebarSceneItem title="EXT. JARDIN - JOUR" />
                    <SidebarSceneItem title="INT. MAISON - JOUR" />
                    <SidebarSceneItem title="EXT. PARKING - JOUR" />
                    <SidebarSceneItem title="EXT. MAGASIN - SOIRÉE" />
                </div>
            </div>
        </div>
    );
};

export default EditorSidebarNavigation;
