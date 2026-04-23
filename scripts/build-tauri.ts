import { existsSync, renameSync, rmSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const apiDir = join("src", "app", "api");
const hiddenApiDir = join("src", "app", "_api");
const adminDir = join("src", "app", "admin");
const hiddenAdminDir = join("src", "app", "_admin");

// Clean .next cache to avoid stale type references to API routes
rmSync(".next", { recursive: true, force: true });

// Prefix with _ so Next.js ignores the API routes during static export
if (existsSync(apiDir)) {
    renameSync(apiDir, hiddenApiDir);
}
if (existsSync(adminDir)) {
    renameSync(adminDir, hiddenAdminDir);
}

try {
    execSync("npx cross-env TAURI_BUILD=true next build", { stdio: "inherit" });
} finally {
    if (existsSync(hiddenApiDir)) {
        renameSync(hiddenApiDir, apiDir);
    }
    if (existsSync(hiddenAdminDir)) {
        renameSync(hiddenAdminDir, adminDir);
    }
}
