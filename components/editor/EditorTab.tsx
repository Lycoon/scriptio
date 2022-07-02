const EditorTab = (props: any) => {
    return (
        <button
            onClick={props.action}
            className={`button tab tab-text ${
                props.active ? "active-tab" : ""
            }`}
        >
            {props.active ? "➤ " : ""}
            {props.content}
        </button>
    );
};

export default EditorTab;
