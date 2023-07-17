import form from "./FormInfo.module.css";

type Props = {
    info: FormInfoType;
};

export interface FormInfoType {
    content: string;
    isError?: boolean;
}

const FormInfo = ({ info }: Props) => {
    const style = info.isError ? form.error : form.text;

    return (
        <div className={form.info}>
            <p className={style}>{info.content}</p>
        </div>
    );
};

export default FormInfo;
