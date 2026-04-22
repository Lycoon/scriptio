import type { NextConfig } from "next";

const isTauriBuild = process.env.TAURI_BUILD === "true";

const config: NextConfig = {
    reactStrictMode: true,
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
};

export default config;
