"use client";

import form from "./Form.module.css";
import formEnd from "./../projects/FormEnd.module.css";

import { ArrowLeftCircle } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
    onClick: () => void;
};

const BackButton = ({ onClick }: Props) => {
    const t = useTranslations("common");

    return (
        <button className={`${form.btn} ${formEnd.back}`} onClick={onClick}>
            <ArrowLeftCircle size={20} />
            {t("back")}
        </button>
    );
};

export default BackButton;
