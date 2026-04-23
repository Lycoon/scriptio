"use client";

import { ForwardedRef, forwardRef } from "react";
import Image from "next/image";
import dropdown from "./DropdownItem.module.css";

type Props = {
    content: string;
    hovering?: () => void;
    action?: () => void;
    icon?: string;
};

const DropdownItem = forwardRef(({ hovering, content, action, icon }: Props, ref: ForwardedRef<HTMLButtonElement>) => {
    return (
        <button onMouseEnter={hovering} onClick={action} className={dropdown.item} ref={ref}>
            {icon && <Image className={dropdown.item_img} src={`/images/${icon}`} alt="" width={20} height={20} />}
            {content}
        </button>
    );
});

DropdownItem.displayName = "DropdownItem";

export default DropdownItem;
