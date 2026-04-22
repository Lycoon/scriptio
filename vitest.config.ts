import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";
import BenchJsonReporter from "./src/tests/helpers/bench-json-reporter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        browser: {
            enabled: true,
            provider: "playwright",
            instances: [
                { browser: "chromium", headless: true },
                { browser: "webkit", headless: true },
            ],
        },
        setupFiles: ["./src/tests/setup.ts"],
        benchmark: {
            include: ["src/tests/benchmarks/**/*.bench.ts"],
            reporters: [new BenchJsonReporter()],
        },
    },
    resolve: {
        alias: {
            // mirrors tsconfig "@*": ["./*"] — Next.js webpack handles this automatically
            "@src": path.resolve(__dirname, "./src"),
            "@node_modules": path.resolve(__dirname, "./node_modules"),
        },
    },
});
