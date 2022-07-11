const EditorTab = (props: any) => {
    return (
        <button
            onClick={props.action}
            className={`button tab tab-text ${
                props.active ? "active-tab" : ""
            }`}
        >
            {props.active && (
                <img
                    className="editor-tab-icon"
                    src="/images/right-arrow.png"
                    alt="Right arrow icon"
                />
            )}
            {props.content}
        </button>
    );
};

export default EditorTab;
