type Props = {
    title: string;
    position: number;
};

const SidebarSceneItem = ({ title, position }: Props) => {
    return (
        <div className="scene-item">
            <p className="scene-item-title">{title}</p>
        </div>
    );
};

export default SidebarSceneItem;
