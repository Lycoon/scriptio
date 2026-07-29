import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Switches the committed Android project between the staging and release
// identities. The tree is generated once with the staging identifier, so
// `namespace` and the Kotlin package stay app.scriptio.staging (compile-time
// only, and the build regenerates those sources from the config identifier).
// Only applicationId — the published Play package name, which Android allows to
// differ from the namespace — and the launcher label vary per channel.
//
// The single place these two identities are defined: used by CI's apply-version
// action and by build:android:release for local store builds.

const CHANNELS = {
    staging: { applicationId: "app.scriptio.staging", label: "Scriptio (Staging)" },
    release: { applicationId: "app.scriptio", label: "Scriptio" },
};

const channel = process.argv[2];
if (channel !== "staging" && channel !== "release") {
    throw new Error(`Usage: apply-android-channel.ts <staging|release> (got ${JSON.stringify(channel)})`);
}
const { applicationId, label } = CHANNELS[channel];

const GRADLE = join("src-tauri", "gen", "android", "app", "build.gradle.kts");
const STRINGS = join("src-tauri", "gen", "android", "app", "src", "main", "res", "values", "strings.xml");

const patch = (file: string, edits: [RegExp, string][]) => {
    let content = readFileSync(file, "utf8");
    for (const [pattern, replacement] of edits) {
        if (!pattern.test(content)) {
            throw new Error(`Pattern ${pattern} not found in ${file}`);
        }
        content = content.replace(pattern, replacement);
    }
    writeFileSync(file, content);
};

patch(GRADLE, [[/applicationId = "[^"]*"/, `applicationId = "${applicationId}"`]]);
patch(STRINGS, [
    [/(<string name="app_name">)[^<]*(<\/string>)/, `$1${label}$2`],
    [/(<string name="main_activity_title">)[^<]*(<\/string>)/, `$1${label}$2`],
]);

console.log(`[android-channel] ${channel}: applicationId=${applicationId}, label="${label}"`);
