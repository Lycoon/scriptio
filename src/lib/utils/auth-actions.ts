import { signOut } from "next-auth/react";
import { isTauri } from "@tauri-apps/api/core";
import { mutate } from "swr";

/**
 * Sign the current account out, everywhere the app tracks a session.
 *
 * Desktop (Tauri) holds a bearer token in its local secure store and the server
 * has no cookie to clear, so it wipes that token; web clears the NextAuth session
 * cookie. Either way the cached cookie-user is then invalidated so the UI re-reads
 * a signed-out state. Callers own what happens next (redirect home, close a modal,
 * …) — this only tears the session down.
 *
 * Single source of truth for the log-out flow, shared by the dashboard sidebar and
 * the phone navbar menu so they can never drift apart.
 */
export async function signOutAccount(): Promise<void> {
    if (isTauri()) {
        const { clearDesktopToken } = await import("@src/lib/desktop-auth");
        await clearDesktopToken();
    } else {
        await signOut({ redirect: false });
    }
    await mutate("/api/users/cookie", undefined);
}
