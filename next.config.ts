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
                    { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, x-client-type, X-Staging-Auth" },
                ],
            },
        ];
    },
};

export default config;
