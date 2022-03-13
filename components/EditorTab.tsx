const EditorTab = (props: any) => {
  return (
    <button id={props.id_} onClick={props.action} className="button tab tab-text">
      {props.content}
    </button>
  );
};

export default EditorTab;
