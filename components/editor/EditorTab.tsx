"use client";

import { join } from "@src/lib/utils/misc";
import tab from "./EditorTab.module.css";

import { ChevronRight } from "lucide-react";
import { ScreenplayElement } from "@src/lib/utils/enums";

type Props = {
    setActiveElement: (element: ScreenplayElement) => void;
    currentElement: ScreenplayElement;
    element: ScreenplayElement;
    content: string;
};

const EditorTab = ({ setActiveElement, currentElement, element, content }: Props) => {
    const isActive = currentElement == element;
    const activeStyle = isActive ? tab.active : "";
    const tabStyle = join(tab.container, tab.text, activeStyle, "button");

    return (
        <button onClick={() => setActiveElement(element)} className={tabStyle}>
            {isActive && <ChevronRight className={tab.selector} size={10} />}
            {content}
        </button>
    );
};

export default EditorTab;
