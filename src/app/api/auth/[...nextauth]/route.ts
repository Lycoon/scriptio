import { handlers } from "@src/auth";
import { type NextRequest } from "next/server";

export const GET = handlers.GET;

/**
 * Wrap the Auth.js POST handler to fix Apple Sign In's redirect after OAuth.
 *
 * Apple uses response_mode=form_post, which is a cross-site POST. The browser
 * does not send SameSite=Lax cookies with cross-site POSTs, so Auth.js never
 * sees the callbackUrl cookie and falls back to url.origin (homepage). The
 * redirect callback in auth.ts is NOT called in this path — it only runs when
 * Auth.js has a callbackUrl value to validate, which it doesn't here.
 *
 * We intercept the 302 response before it leaves the server: if it would send
 * the user to the bare homepage (no ?error param, meaning sign-in succeeded),
 * we rewrite the Location to /desktop-oauth/complete. That page recovers the
 * nonce from sessionStorage (stored by DesktopOAuthStart) for the Tauri flow,
 * or redirects to /projects for plain web users.
 */
export async function POST(req: NextRequest, context: unknown) {
    const response = await handlers.POST(req, context as never);

    if (new URL(req.url).pathname === "/api/auth/callback/apple") {
        const location = response.headers.get("Location");
        if (location) {
            try {
                const dest = new URL(location);
                const isHomepageFallback =
                    dest.pathname === "/" && !dest.searchParams.has("error");
                if (isHomepageFallback) {
                    const headers = new Headers(response.headers);
                    headers.set("Location", `${dest.origin}/desktop-oauth/complete`);
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers,
                    });
                }
            } catch {}
        }
    }

    return response;
}
