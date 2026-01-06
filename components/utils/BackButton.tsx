import form from "./Form.module.css";
import formEnd from "./../projects/FormEnd.module.css";

import { ArrowLeftCircle } from "lucide-react";

type Props = {
    onClick: () => void;
};

const BackButton = ({ onClick }: Props) => {
    return (
        <button className={`${form.btn} ${formEnd.back}`} onClick={onClick}>
            <ArrowLeftCircle size={20} />
            Back
        </button>
    );
};

export default BackButton;
