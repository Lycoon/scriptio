type Props = {
    content: string;
    hovering: () => void;
    action?: () => void;
    icon?: string;
};

const DropdownItem = ({ hovering, content, action, icon }: Props) => {
    return (
        <button
            onMouseEnter={hovering}
            onClick={action}
            className="dropdown-item"
        >
            {icon && (
                <img className="dropdown-item-icon" src={`/images/${icon}`} />
            )}
            {content}
        </button>
    );
};

export default DropdownItem;
