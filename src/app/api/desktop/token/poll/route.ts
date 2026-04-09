import { NextRequest } from "next/server";

import { apiHandler } from "@src/lib/utils/api-handler";
import { BodyFieldError, Success } from "@src/lib/utils/api-utils";
import { takeBridgeToken } from "@src/lib/desktop-bridge";

/**
 * GET `/api/desktop/token/poll?nonce=...`
 *
 * Polled by the desktop client after it opens the OAuth bridge in an external
 * browser. Returns `{ token }` once the browser side has handed off, then deletes
 * it. Returns `{ token: null }` while waiting so the client can keep polling.
 */
async function pollRoute(req: NextRequest) {
    const url = new URL(req.url);
    const nonce = url.searchParams.get("nonce");
    if (!nonce) throw new BodyFieldError("Missing nonce");

    const token = takeBridgeToken(nonce);
    return Success({ token });
}

export const GET = apiHandler(pollRoute);
