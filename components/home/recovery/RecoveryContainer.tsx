"use client";

import PasswordChangeForm from "./PasswordChangeForm";
import RecoveryForm from "./RecoveryForm";
import ScriptioLogo from "@public/images/scriptio.svg";

import layout from "../../utils/Layout.module.css";
import styles from "./RecoveryForm.module.css";
import { useSearchParams } from "next/navigation";

export default function RecoveryContainer() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    return (
        <div className={layout.center_middle}>
            <div className={styles.recoveryPage}>
                <div className={styles.logoSide}>
                    <ScriptioLogo className={styles.logo} />
                </div>
                <div className={styles.formSide}>
                    {token ? <PasswordChangeForm token={token} /> : <RecoveryForm />}
                </div>
            </div>
        </div>
    );
}
