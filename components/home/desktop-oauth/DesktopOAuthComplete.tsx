"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { submitDesktopToken } from "@src/lib/utils/requests";

import ScriptioLogo from "@public/images/scriptio.svg";
import layout from "../../utils/Layout.module.css";
import auth from "../auth/AuthPage.module.css";
import form from "../../utils/Form.module.css";

type Status = "working" | "done" | "error";

/**
 * Final step of the desktop OAuth bridge.
 *
 * After NextAuth has signed the user in (cookie set in this browser), we POST the
 * nonce to /api/desktop/token. The server reads the session, mints a NextAuth JWE,
 * and stows it under the nonce so the desktop poller can pick it up.
 *
 * The nonce comes from the URL for Google (callbackUrl cookie survives the redirect)
 * or from sessionStorage for Apple (response_mode=form_post drops the cookie, so
 * DesktopOAuthStart stored the nonce there before the handoff). If neither source
 * has a nonce the visitor is a web user who signed in with Apple — send them to /projects.
 */
const DesktopOAuthComplete = () => {
    const searchParams = useSearchParams();
    const router = useRouter();
    const urlNonce = searchParams.get("nonce");
    const [status, setStatus] = useState<Status>("working");

    useEffect(() => {
        const nonce = urlNonce ?? sessionStorage.getItem("desktop-oauth-nonce");

        if (!nonce) {
            // Web user signed in with Apple — no desktop bridge needed.
            router.replace("/projects");
            return;
        }

        sessionStorage.removeItem("desktop-oauth-nonce");

        submitDesktopToken(nonce)
            .then(res => setStatus(res.ok ? "done" : "error"))
            .catch(() => setStatus("error"));
    }, [urlNonce, router]);

    const message =
        status === "working"
            ? "Finishing sign-in…"
            : status === "done"
              ? "You're signed in. You can return to the Scriptio desktop app."
              : "Sign-in could not be completed. Please retry from the desktop app.";

    return (
        <div className={layout.center_middle}>
            <div className={auth.authPage}>
                <ScriptioLogo className={auth.authLogo} />
                <div className={form.home}>
                    <div className={form.header}>
                        <h1>Sign in</h1>
                        <hr />
                        <p className={`${auth.info} segoe`}>{message}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DesktopOAuthComplete;
