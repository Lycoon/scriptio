"use client";

import BackButton from "@components/utils/BackButton";

import form_end from "./FormEnd.module.css";
import form from "../utils/Form.module.css";

type Props = {
    submitText: string;
    isSubmitting?: boolean;
    onBack: () => void;
};

const FormEnd = ({ submitText, onBack, isSubmitting }: Props) => {
    return (
        <div className={form_end.container}>
            <BackButton onClick={onBack} />
            <button disabled={isSubmitting} className={`${form.btn} ${form_end.submit}`} type="submit">
                {submitText}
            </button>
        </div>
    );
};

export default FormEnd;
