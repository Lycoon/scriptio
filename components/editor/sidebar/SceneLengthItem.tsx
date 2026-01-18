"use client";

import { Scene } from "@src/lib/screenplay/scenes";
import { join } from "@src/lib/utils/misc";

import nav_item from "./SidebarItem.module.css";

type Props = {
    scene: Scene;
};

const PageCounterItem = ({ scene }: Props) => {
    const length = +((scene.nextPosition - scene.position) / 1100).toFixed(1);
    const content = length + " p.";

    return <p className={join(nav_item.sceneLength, "unselectable")}>{content}</p>;
};

export default PageCounterItem;
