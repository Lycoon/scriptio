import { join } from "@src/lib/utils/misc";
import tab from "./EditorTab.module.css";

import SelectorSVG from "@public/images/selector.svg";

const EditorTab = (props: any) => {
    const activeTab = props.active ? tab.active : "";

    return (
        <button onClick={props.action} className={join(tab.container, tab.text, activeTab, "button")}>
            {props.active && <SelectorSVG className={tab.selector} alt="Selector icon" />}
            {props.content}
        </button>
    );
};

export default EditorTab;
