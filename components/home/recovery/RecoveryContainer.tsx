"use client";

import PasswordChangeForm from "./PasswordChangeForm";
import RecoveryForm from "./RecoveryForm";

import layout from "../../utils/Layout.module.css";

export default function RecoveryContainer({ userId, recoverHash }: { userId: string; recoverHash: string }) {
    const form = recoverHash ? <PasswordChangeForm userId={userId} recoverHash={recoverHash} /> : <RecoveryForm />;
    return (
        <>
            <div className={layout.center_middle}>{form}</div>
        </>
    );
}
