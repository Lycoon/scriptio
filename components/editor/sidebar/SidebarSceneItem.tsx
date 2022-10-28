type Props = {
    title: string;
};

const SidebarSceneItem = ({ title }: Props) => {
    return (
        <div className="scene-item">
            <p className="scene-item-title">{title}</p>
        </div>
    );
};

export default SidebarSceneItem;
