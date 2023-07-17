import FormInfo, { FormInfoType } from "@components/utils/FormInfo";

import form_header from "./FormHeader.module.css";

type Props = {
    title: string;
    formInfo: FormInfoType | null;
};

const FormHeader = ({ title, formInfo }: Props) => {
    return (
        <div className={form_header.container}>
            <h1>{title}</h1>
            <hr />
            {formInfo && <FormInfo info={formInfo} />}
        </div>
    );
};

export default FormHeader;
