import { join } from "@src/lib/utils/misc";
import tab from "./EditorTab.module.css";

import SelectorSVG from "@public/images/selector.svg";
import { EditorElement, ScreenplayElement, TitlePageElement } from "@src/lib/utils/enums";

type EditorTabProps<T extends EditorElement> = {
    setActiveElement: (element: T) => void;
    currentElement: T;
    element: T;
    content: string;
};

const EditorTab = <T extends EditorElement>({
    setActiveElement,
    currentElement,
    element,
    content,
}: EditorTabProps<T>) => {
    const isActive = currentElement == element;
    const activeStyle = isActive ? tab.active : "";
    const tabStyle = join(tab.container, tab.text, activeStyle, "button");

    return (
        <button onClick={() => setActiveElement(element)} className={tabStyle}>
            {isActive && <SelectorSVG className={tab.selector} alt="Selector icon" />}
            {content}
        </button>
    );
};

export default EditorTab;
