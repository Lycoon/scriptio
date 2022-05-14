type NavbarButtonProps = {
  action?: () => void;
  content: string;
};

const NavbarButton: React.FC<NavbarButtonProps> = ({ action, content }) => {
  return (
    <div>
      <a onClick={action} className="navbar-btn">
        {content}
      </a>
    </div>
  );
};

export default NavbarButton;
