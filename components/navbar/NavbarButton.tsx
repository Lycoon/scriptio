import Link from "next/link";

type Props = {
    action?: () => void;
    content: string;
};

const NavbarButton = ({ action, content }: Props) => {
    return (
        <div className="navbar-btn" onClick={action}>
            <p>{content}</p>
        </div>
    );
};

export default NavbarButton;
