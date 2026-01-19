"use client";

import PasswordChangeForm from "./PasswordChangeForm";
import RecoveryForm from "./RecoveryForm";

import layout from "../../utils/Layout.module.css";
import { useSearchParams } from "next/navigation";

export default function RecoveryContainer() {
    const searchParams = useSearchParams();
    const id = searchParams.get("id");
    const code = searchParams.get("code");

    return (
        <div className={layout.center_middle}>
            {id && code ? <PasswordChangeForm userId={id} code={code} /> : <RecoveryForm />}
        </div>
    );
}
