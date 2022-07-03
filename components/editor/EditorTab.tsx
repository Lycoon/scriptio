const EditorTab = (props: any) => {
    return (
        <button
            onClick={props.action}
            className={`button tab tab-text ${
                props.active ? "active-tab" : ""
            }`}
        >
            {props.active ? <span className="tab-arrow">➤ </span> : ""}
            {props.content}
        </button>
    );
};

export default EditorTab;
