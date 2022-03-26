const DropdownItem = (props: any) => {
  return <button onMouseEnter={props.hovering} onClick={props.action} className="dropdown-item">{props.content}</button>;
};

export default DropdownItem;
