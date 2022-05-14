const NavbarButton = (props: any) => {
  return (
    <div>
      <a href={props.redirect} onClick={props.action} className="navbar-btn">
        {props.content}
      </a>
    </div>
  );
};

export default NavbarButton;
