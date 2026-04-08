"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

import ScriptioLogo from "@public/images/scriptio.svg";
import layout from "../../utils/Layout.module.css";
import recovery from "../recovery/RecoveryForm.module.css";
import form from "../../utils/Form.module.css";

const ALLOWED_PROVIDERS = new Set(["google", "apple"]);

/**
 * Bridge entry point for desktop OAuth.
 *
 * The desktop client opens this URL in the user's default browser with `?provider=...&nonce=...`.
 * We immediately hand off to NextAuth, asking it to redirect to /desktop-auth/complete (carrying
 * the nonce) once the OAuth dance succeeds.
 */
const DesktopAuthStart = () => {
    const searchParams = useSearchParams();
    const provider = searchParams.get("provider");
    const nonce = searchParams.get("nonce");

    useEffect(() => {
        if (!provider || !nonce || !ALLOWED_PROVIDERS.has(provider)) return;
        const callbackUrl = `/desktop-auth/complete?nonce=${encodeURIComponent(nonce)}`;
        signIn(provider, { callbackUrl });
    }, [provider, nonce]);

    const invalid = !provider || !nonce || !ALLOWED_PROVIDERS.has(provider);

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
                            <p className={`${recovery.info} segoe`}>
                                {invalid
                                    ? "This page should be opened from the Scriptio desktop app."
                                    : "Redirecting you to your provider…"}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DesktopAuthStart;
