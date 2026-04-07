"use client";

import { memo } from "react";
import { Scene } from "@src/lib/screenplay/scenes";
import { join } from "@src/lib/utils/misc";

import nav_item from "./SidebarItem.module.css";

type Props = {
    scene: Scene;
};

const SceneLengthItem = memo(({ scene }: Props) => {
    const totalEighths = Math.max(1, Math.round(((scene.nextPosition - scene.position) / 1100) * 8));
    const fullPages = Math.floor(totalEighths / 8);
    const remainder = totalEighths % 8;
    const content =
        fullPages > 0 && remainder > 0
            ? `${fullPages}+${remainder}/8 p`
            : fullPages > 0
              ? `${fullPages} p`
              : `${remainder}/8 p`;

    return <p className={join(nav_item.sceneLength, "unselectable")}>{content}</p>;
});

SceneLengthItem.displayName = "SceneLengthItem";

export default SceneLengthItem;
