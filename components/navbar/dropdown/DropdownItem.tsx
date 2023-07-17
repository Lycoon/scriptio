import { ForwardedRef, MutableRefObject, RefObject, forwardRef } from "react";
import dropdown from "./DropdownItem.module.css";

type Props = {
    content: string;
    hovering?: () => void;
    action?: () => void;
    icon?: string;
};

const DropdownItem = forwardRef(
    ({ hovering, content, action, icon }: Props, ref: ForwardedRef<HTMLButtonElement>) => {
        return (
            <button onMouseEnter={hovering} onClick={action} className={dropdown.item} ref={ref}>
                {icon && <img className={dropdown.item_img} src={`/images/${icon}`} />}
                {content}
            </button>
        );
    }
);

export default DropdownItem;
