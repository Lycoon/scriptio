import { existsSync, renameSync, rmSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const apiDir = join("src", "app", "api");
const hiddenDir = join("src", "app", "_api");

// Clean .next cache to avoid stale type references to API routes
rmSync(".next", { recursive: true, force: true });

// Prefix with _ so Next.js ignores the API routes during static export
if (existsSync(apiDir)) {
    renameSync(apiDir, hiddenDir);
}

try {
    execSync("npx cross-env TAURI_BUILD=true next build", { stdio: "inherit" });
} finally {
    if (existsSync(hiddenDir)) {
        renameSync(hiddenDir, apiDir);
    }
}
