import type { NextConfig } from "next";

const isTauriBuild = process.env.TAURI_BUILD === "true";

const config: NextConfig = {
    reactStrictMode: true,
    serverExternalPackages: ["@prisma/client", "prisma"],
    turbopack: {
        rules: {
            "*.svg": {
                loaders: ["@svgr/webpack"],
                as: "*.js",
            },
        },
        // Kokoro/Transformers.js targets both Node and the browser. Its Node-only
        // deps (onnxruntime-node, sharp) and the node builtins its file loaders
        // reference must be stubbed for the browser/worker bundle so the dev
        // (turbopack) bundler doesn't try to resolve them.
        resolveAlias: {
            fs: { browser: "./src/lib/tts/empty-module.js" },
            path: { browser: "./src/lib/tts/empty-module.js" },
            crypto: { browser: "./src/lib/tts/empty-module.js" },
            "onnxruntime-node": { browser: "./src/lib/tts/empty-module.js" },
            sharp: { browser: "./src/lib/tts/empty-module.js" },
        },
    },
    // Same shims for the production (webpack) build used by `next build` / Tauri.
    webpack: (config) => {
        config.resolve = config.resolve ?? {};
        config.resolve.fallback = {
            ...(config.resolve.fallback ?? {}),
            fs: false,
            path: false,
            crypto: false,
        };
        config.resolve.alias = {
            ...(config.resolve.alias ?? {}),
            "onnxruntime-node": false,
            sharp: false,
        };
        return config;
    },
    // Only use static export for Tauri builds
    ...(isTauriBuild && {
        output: "export",
    }),
    images: {
        // Tauri needs unoptimized images; web can use Next.js optimization
        unoptimized: isTauriBuild,
    },
    // The Tauri window entry is `projects.html` (a file in the static export).
    // In dev, `next dev` serves that page as the route `/projects` (no `.html`)
    // and its assets at `/_next`. On iOS the frontend is served through the
    // `tauri://localhost` scheme and the webview may request the entry (and its
    // assets) under a `/projects` path prefix; on desktop the window url resolves
    // to `/projects.html` off the root devUrl. Map all of those back to the route
    // so the simulator loads what desktop does. Ignored by `output: export`, so
    // the bundled `out/` prod/staging frontend is unaffected.
    async rewrites() {
        return [
            { source: "/projects.html", destination: "/projects" },
            { source: "/projects/projects.html", destination: "/projects" },
            { source: "/projects/_next/:path*", destination: "/_next/:path*" },
        ];
    },
    async headers() {
        return [
            {
                source: "/api/:path*",
                headers: [
                    { key: "Access-Control-Allow-Origin", value: "*" },
                    { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
                    { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, x-client-type" },
                ],
            },
        ];
    },
};

export default config;
