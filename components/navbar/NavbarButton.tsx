import btn from "./NavbarButton.module.css";

type Props = {
    action?: () => void;
    content: string;
};

const NavbarButton = ({ action, content }: Props) => {
    return (
        <div className={btn.container} onClick={action}>
            <p>{content}</p>
        </div>
    );
};

export default NavbarButton;
