import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

// Builds the production .aab locally, for manual upload to the Play Console.
// The committed project carries the staging identity, so flip it to release for
// the build and restore it afterwards — including when the build fails, so the
// working tree is never left holding the production package name.

// Not app/build/intermediates/**/intermediary-bundle.aab, which is the unsigned
// bundle Gradle produces on the way to this one.
const AAB = join(
    "src-tauri", "gen", "android", "app", "build", "outputs", "bundle", "universalRelease", "app-universal-release.aab"
);

const channel = (name: string) => execSync(`npx tsx scripts/apply-android-channel.ts ${name}`, { stdio: "inherit" });

channel("release");
try {
    execSync("npm run build:android", { stdio: "inherit" });
} finally {
    console.log("\n[android-release] build finished, restoring the working tree to staging:");
    channel("staging");
}

if (existsSync(AAB)) {
    console.log(`\n[android-release] upload this to the Play Console (built as app.scriptio):\n    ${AAB}`);
}
