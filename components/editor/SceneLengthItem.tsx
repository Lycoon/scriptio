import { SceneItem } from "../../src/lib/screenplay";

type Props = {
    scene: SceneItem;
};

const PageCounterItem = ({ scene }: Props) => {
    const length = +((scene.nextPosition - scene.position) / 1100).toFixed(1);
    const content = length + " p.";

    return <p className="scene-item-preview unselectable">{content}</p>;
};

export default PageCounterItem;
