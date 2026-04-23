import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { registry } from "../../../lib/metrics/registry";
import { startDbSizeCollector } from "../../../lib/metrics/db-size-collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

startDbSizeCollector();

const isAuthorized = (header: string | null): boolean => {
    const expected = process.env.METRICS_BEARER_TOKEN;
    if (!expected || !header?.startsWith("Bearer ")) return false;
    const provided = header.slice("Bearer ".length);
    const a = new Uint8Array(Buffer.from(provided));
    const b = new Uint8Array(Buffer.from(expected));
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
};

export const GET = async (req: NextRequest) => {
    if (!isAuthorized(req.headers.get("authorization"))) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    const body = await registry.metrics();
    return new NextResponse(body, {
        status: 200,
        headers: { "Content-Type": registry.contentType },
    });
};
