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
