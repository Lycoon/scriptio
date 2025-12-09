declare global {
    interface Window {
        __TAURI__: unknown;
    }
}

declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: "development" | "production";
        COLLAB_WEBSOCKET_URL: string;

        // Token Secrets
        JWT_SECRET: string;
        COOKIE_SECRET: string;

        // Database
        DATABASE_URL: string;
        DB_USER: string;
        DB_PASSWORD: string;
        DB_HOST: string;

        // S3
        S3_BUCKET: string;
        S3_URL: string;
        S3_SECRET: string;
        S3_ACCESS: string;

        // SMTP
        SMTP_USER: string;
        SMTP_SECRET: string;
    }
}
