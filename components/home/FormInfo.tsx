type Props = {
    info: FormInfoType;
};

export interface FormInfoType {
    content: string;
    isError?: boolean;
}

const FormInfo = ({ info }: Props) => {
    const style = "form-info-" + (info.isError ? "error" : "text");

    return (
        <div className="form-info">
            <p className={style}>{info.content}</p>
        </div>
    );
};

export default FormInfo;
