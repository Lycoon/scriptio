/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    webpack: (config) => {
        config.resolve.fallback = {
            fs: false,
            path: false,
        };

        return config;
    },
    images: {
        unoptimized: true,
    },
};

module.exports = nextConfig;
