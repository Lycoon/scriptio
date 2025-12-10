import type { NextConfig } from "next";

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

    images: {
        unoptimized: true,
    },
};

module.exports = config;
