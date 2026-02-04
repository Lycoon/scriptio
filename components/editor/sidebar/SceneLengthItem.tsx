"use client";

import { memo } from "react";
import { Scene } from "@src/lib/screenplay/scenes";
import { join } from "@src/lib/utils/misc";

import nav_item from "./SidebarItem.module.css";

type Props = {
    scene: Scene;
};

const SceneLengthItem = memo(({ scene }: Props) => {
    const length = +((scene.nextPosition - scene.position) / 1100).toFixed(1);
    const content = length + " p.";

    return <p className={join(nav_item.sceneLength, "unselectable")}>{content}</p>;
});

SceneLengthItem.displayName = "SceneLengthItem";

export default SceneLengthItem;
