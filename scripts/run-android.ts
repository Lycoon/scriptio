import { existsSync } from "fs";
import { join } from "path";
import { execSync, spawn, spawnSync } from "child_process";

const APP_ID = "ArkoLogic.ScriptioStaging";
const APK_DIR = join("src-tauri", "gen", "android", "app", "build", "outputs", "apk");

// Maps the device's reported ABI to the matching Rust/Tauri target.
const ABI_TARGETS: Record<string, string> = {
    "arm64-v8a": "aarch64",
    "armeabi-v7a": "armv7",
    x86: "i686",
    x86_64: "x86_64",
};

const exe = (name: string) => (process.platform === "win32" ? `${name}.exe` : name);

const sdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!sdkRoot) {
    throw new Error("ANDROID_HOME (or ANDROID_SDK_ROOT) is not set");
}
const adb = join(sdkRoot, "platform-tools", exe("adb"));
const emulator = join(sdkRoot, "emulator", exe("emulator"));

const adbOut = (...args: string[]) => spawnSync(adb, args, { encoding: "utf8" }).stdout?.trim() ?? "";

/** Serial of the first device that reports as fully booted, if any. */
function bootedSerial() {
    const serials = adbOut("devices")
        .split("\n")
        .slice(1)
        .filter((line) => line.includes("\tdevice"))
        .map((line) => line.split("\t")[0]);

    return serials.find((serial) => adbOut("-s", serial, "shell", "getprop", "sys.boot_completed") === "1");
}

/** Launches the first available AVD, detached so it outlives this script. */
function startEmulator() {
    const avd = spawnSync(emulator, ["-list-avds"], { encoding: "utf8" }).stdout?.trim().split("\n")[0]?.trim();
    if (!avd) {
        throw new Error("No AVD found. Create one in Android Studio's Device Manager, then rerun.");
    }
    console.log(`[android] no booted device, starting emulator "${avd}"...`);
    spawn(emulator, ["-avd", avd], { detached: true, stdio: "ignore" }).unref();
}

async function waitForBoot(timeoutMs = 240_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const serial = bootedSerial();
        if (serial) {
            return serial;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error("Timed out waiting for the emulator to boot");
}

// Start the emulator up front so it boots while the (slow) build runs.
let serial = bootedSerial();
if (!serial) {
    startEmulator();
}

// A debug build bundles the static frontend export, so the APK runs standalone
// with no dev server and no hot reload.
const target = serial ? (ABI_TARGETS[adbOut("-s", serial, "shell", "getprop", "ro.product.cpu.abi")] ?? "x86_64") : "x86_64";
execSync(`npx tauri android build --debug --apk --target ${target}`, { stdio: "inherit" });

const apk = join(APK_DIR, "universal", "debug", "app-universal-debug.apk");
if (!existsSync(apk)) {
    throw new Error(`Expected APK not found at ${apk}`);
}

serial ??= await waitForBoot();

console.log(`[android] installing on ${serial} (may take a while, the APK is large)...`);
if (spawnSync(adb, ["-s", serial, "install", "-r", apk], { stdio: "inherit" }).status !== 0) {
    throw new Error("adb install failed");
}

spawnSync(adb, ["-s", serial, "shell", "monkey", "-p", APP_ID, "-c", "android.intent.category.LAUNCHER", "1"], {
    stdio: "ignore",
});
console.log(`[android] launched ${APP_ID}`);
