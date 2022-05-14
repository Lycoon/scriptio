type NavbarButtonProps = {
  redirect?: string;
  action?: () => void;
  content: string;
};

const NavbarButton: React.FC<NavbarButtonProps> = ({
  redirect,
  action,
  content,
}) => {
  return (
    <div>
      <a href={redirect} onClick={action} className="navbar-btn">
        {content}
      </a>
    </div>
  );
};

export default NavbarButton;
