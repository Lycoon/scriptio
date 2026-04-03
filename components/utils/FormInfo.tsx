"use client";

import form from "./FormInfo.module.css";

type Props = {
    info: FormInfoType;
};

export interface FormInfoType {
    content: string;
    isError?: boolean;
    isInfo?: boolean;
}

const FormInfo = ({ info }: Props) => {
    let style = form.text;
    if (info.isError) style = form.error;
    else if (info.isInfo) style = form.infoBox;

    return (
        <div className={form.info}>
            <p className={style}>{info.content}</p>
        </div>
    );
};

export default FormInfo;
