"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signOut } from "next-auth/react";

import ScriptioLogo from "@public/images/scriptio.svg";
import layout from "../../utils/Layout.module.css";
import auth from "../auth/AuthPage.module.css";
import form from "../../utils/Form.module.css";

const ALLOWED_PROVIDERS = new Set(["google", "apple"]);

/**
 * Bridge entry point for desktop OAuth.
 *
 * The desktop client opens this URL in the user's default browser with `?provider=...&nonce=...`.
 * We immediately hand off to NextAuth, asking it to redirect to /desktop-oauth/complete (carrying
 * the nonce) once the OAuth dance succeeds.
 */
const DesktopOAuthStart = () => {
    const searchParams = useSearchParams();
    const provider = searchParams.get("provider");
    const nonce = searchParams.get("nonce");

    useEffect(() => {
        if (!provider || !nonce || !ALLOWED_PROVIDERS.has(provider)) return;
        // Drop any pre-existing browser session before starting OAuth. If the browser
        // was previously signed in as user A and the OAuth account being linked here
        // resolves to user B, handle-login.ts throws OAuthAccountNotLinked because
        // sessionToken.user.id !== getUserByAccount().id. Starting clean avoids that.
        (async () => {
            const callbackUrl = `/desktop-oauth/complete?nonce=${encodeURIComponent(nonce)}`;
            await signOut({ redirect: false });
            await signIn(provider, { callbackUrl });
        })();
    }, [provider, nonce]);

    const invalid = !provider || !nonce || !ALLOWED_PROVIDERS.has(provider);

    return (
        <div className={layout.center_middle}>
            <div className={auth.authPage}>
                <ScriptioLogo className={auth.authLogo} />
                <div className={form.home}>
                    <div className={form.header}>
                        <h1>Sign in</h1>
                        <hr />
                        <p className={`${auth.info} segoe`}>
                            {invalid
                                ? "This page should be opened from the Scriptio desktop app."
                                : "Redirecting you to your provider…"}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DesktopOAuthStart;
