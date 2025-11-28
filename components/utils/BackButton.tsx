import form from "./Form.module.css";
import btn from "./Button.module.css";

import BackSVG from "@public/images/back.svg";
import { join } from "@src/lib/utils/misc";

type Props = {
    onClick: () => void;
};

const BackButton = ({ onClick }: Props) => {
    return (
        <button className={join(form.btn, btn.back)} onClick={onClick}>
            <BackSVG className={btn.back_icon} />
            Back
        </button>
    );
};

export default BackButton;
