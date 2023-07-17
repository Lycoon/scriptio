import { SceneItem } from "@src/lib/screenplay";
import { join } from "@src/lib/utils/misc";

import nav_item from "./SidebarItem.module.css";

type Props = {
    scene: SceneItem;
};

const PageCounterItem = ({ scene }: Props) => {
    const length = +((scene.nextPosition - scene.position) / 1100).toFixed(1);
    const content = length + " p.";

    return <p className={join(nav_item.preview, "unselectable")}>{content}</p>;
};

export default PageCounterItem;
