"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ScriptioLogo from "@public/images/scriptio.svg";
import layout from "../../utils/Layout.module.css";
import auth from "./AuthPage.module.css";
import form from "../../utils/Form.module.css";
import { ApiResponse } from "@src/lib/utils/api-utils";

type Status = "working" | "desktop" | "error";

/**
 * Landing for `/auth/magic-link?token=...`.
 *
 * POSTs the token to /api/auth/magic-link/verify exactly once. On success the
 * server has either:
 *  - set the NextAuth session cookie (web) → we redirect into /projects, or
 *  - pushed the session JWE into the desktop bridge → we tell the user to return
 *    to the desktop app, where the polling client will pick the token up.
 */
const MagicLinkLanding = () => {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token");

    const [status, setStatus] = useState<Status>(token ? "working" : "error");
    // Strict mode mounts effects twice in dev — guard against double-consuming the token.
    const consumedRef = useRef(false);

    useEffect(() => {
        if (!token) return;
        if (consumedRef.current) return;
        consumedRef.current = true;

        (async () => {
            try {
                const res = await fetch("/api/auth/magic-link/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                });
                const json = (await res.json()) as ApiResponse<{ mode: "web" | "desktop" }>;
                if (!res.ok || !json.data) {
                    setStatus("error");
                    return;
                }
                if (json.data.mode === "desktop") {
                    setStatus("desktop");
                    return;
                }
                // Hard navigation forces a new request that carries the freshly set
                // session cookie, so middleware/SSR see the user as authenticated.
                window.location.href = "/projects";
            } catch {
                setStatus("error");
            }
        })();
    }, [token, router]);

    const message =
        status === "working"
            ? "Signing you in…"
            : status === "desktop"
              ? "You're signed in. You can return to the Scriptio desktop app."
              : "This sign-in link is invalid or has expired. Please request a new one from the app.";

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

export default MagicLinkLanding;
