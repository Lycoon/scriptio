import form_end from "./FormEnd.module.css";
import form from "../utils/Form.module.css";
import btn from "../utils/Button.module.css";
import { join } from "@src/lib/utils/misc";
import BackButton from "@components/utils/BackButton";

type Props = {
    submitText: string;
    isSubmitting?: boolean;
    onBack: () => void;
};

const FormEnd = ({ submitText, onBack, isSubmitting }: Props) => {
    return (
        <div className={form_end.container}>
            <BackButton onClick={onBack} />
            <button disabled={isSubmitting} className={join(form.btn, form_end.submit)} type="submit">
                {submitText}
            </button>
        </div>
    );
};

export default FormEnd;
