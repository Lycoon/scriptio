const NavbarButton = (props: any) => {
    return (
        <div id="navbar-btn">
            <a href={props.redirect} className="btn">
                {props.content}
            </a>
        </div >
    );
}

export default NavbarButton;