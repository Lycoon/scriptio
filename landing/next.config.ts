import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Pin the workspace root to this folder. Otherwise Next climbs to the parent
// repo (which has its own lockfile) and pulls in the app's middleware/src, which
// don't belong to — and don't resolve in — the static landing build.
const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Standalone static build of the public marketing site (/, /privacy, /contact).
 * Exported to `out/` and served by nginx behind Traefik, fully decoupled from the
 * app container's deploy lifecycle.
 *
 * `assetPrefix` moves every /_next asset to /_site/_next so it never collides with
 * the app's /_next namespace on the shared scriptio.app host. Traefik routes
 * /_site/* here; everything else (including the app's /_next) goes to the app.
 * It's only applied to the production build — in `next dev` the prefix isn't
 * served, so the dev server keeps assets at the default /_next and works at `/`.
 */
const isProd = process.env.NODE_ENV === "production";

const config: NextConfig = {
    reactStrictMode: true,
    turbopack: { root: rootDir },
    ...(isProd && { output: "export", assetPrefix: "/_site" }),
    images: {
        // Static export has no image optimization server.
        unoptimized: true,
    },
};

export default config;
