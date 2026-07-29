import { cpSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";

// Regenerates the Android launcher icons in gen/android from a source app icon.
//
// `tauri android init` seeds the Tauri default launcher icons and never derives
// them from ours, so this has to run after every init. It cannot simply call
// `tauri icon` in place: that also rewrites src-tauri/icons, clobbering the
// Icon Composer outputs (icon.icns, Assets.car) and icon.png, which the
// Microsoft Store asset set is generated from. So generate into a temp dir and
// copy out only the Android resources.

// The icon artwork is a black disc, so the adaptive-icon backdrop behind the
// scaled foreground has to be black too or it shows as a ring.
const BACKGROUND_COLOR = "#000000";

const source = process.argv[2] ?? join("src-tauri", "icons", "app-icon.png");
const resDir = join("src-tauri", "gen", "android", "app", "src", "main", "res");

const tmp = mkdtempSync(join(tmpdir(), "scriptio-android-icons-"));
try {
    execSync(`npx tauri icon "${source}" -o "${tmp}"`, { stdio: "inherit" });

    cpSync(join(tmp, "android"), resDir, { recursive: true });

    writeFileSync(
        join(resDir, "values", "ic_launcher_background.xml"),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">${BACKGROUND_COLOR}</color>\n</resources>\n`
    );
} finally {
    rmSync(tmp, { recursive: true, force: true });
}

console.log(`[android-icons] regenerated launcher icons in ${resDir} from ${source}`);
