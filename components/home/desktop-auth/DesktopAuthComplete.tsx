"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import ScriptioLogo from "@public/images/scriptio.svg";
import layout from "../../utils/Layout.module.css";
import recovery from "../recovery/RecoveryForm.module.css";
import form from "../../utils/Form.module.css";

type Status = "working" | "done" | "error";

/**
 * Final step of the desktop OAuth bridge.
 *
 * After NextAuth has signed the user in (cookie set in this browser), we POST the
 * nonce to /api/desktop/token. The server reads the session, mints a NextAuth JWE,
 * and stows it under the nonce so the desktop poller can pick it up.
 */
const DesktopAuthComplete = () => {
    const searchParams = useSearchParams();
    const nonce = searchParams.get("nonce");
    const [status, setStatus] = useState<Status>("working");

    useEffect(() => {
        if (!nonce) {
            setStatus("error");
            return;
        }
        (async () => {
            try {
                const res = await fetch("/api/desktop/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nonce }),
                });
                setStatus(res.ok ? "done" : "error");
            } catch {
                setStatus("error");
            }
        })();
    }, [nonce]);

    const message =
        status === "working"
            ? "Finishing sign-in…"
            : status === "done"
              ? "You're signed in. You can return to the Scriptio desktop app."
              : "Sign-in could not be completed. Please retry from the desktop app.";

    return (
        <div className={layout.center_middle}>
            <div className={recovery.recoveryPage}>
                <div className={recovery.logoSide}>
                    <ScriptioLogo className={recovery.logo} />
                </div>
                <div className={recovery.formSide}>
                    <div className={form.home}>
                        <div className={form.header}>
                            <h1>Sign in</h1>
                            <hr />
                            <p className={`${recovery.info} segoe`}>{message}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DesktopAuthComplete;
