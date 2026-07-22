// Regenerates the entire MSIX/Store asset set in src-tauri/gen/windows/Assets
// from a SINGLE source icon: src-tauri/icons/icon.png. Nothing in this set is
// committed (see gen/windows/.gitignore) — it is rebuilt before every Windows
// build by the pre* npm hooks, so to change the visuals you only ever update the
// master icon (app-icon.png -> `tauri icon` -> icon.png); every tile and every
// taskbar variant re-derives from it.
//
// Staging is handled for free: apply-version swaps src-tauri/icons-staging/icon.png
// into src-tauri/icons/ before the build, so this script picks up the blue master
// and emits blue tiles + blue unplated taskbar icons. (The exe favicon separately
// follows the swapped src-tauri/icons/icon.ico.)
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src-tauri", "icons", "icon.png"); // 512px master
const outDir = path.join(root, "src-tauri", "gen", "windows", "Assets");
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

fs.mkdirSync(outDir, { recursive: true });

/** Resize the master to an NxN transparent PNG. */
const square = (size: number) =>
	sharp(source).resize(size, size, { fit: "contain", background: transparent }).png();

// 1. Store/tile logos referenced by AppxManifest.xml (VisualElements + Logo).
const tiles: Record<string, number> = {
	"StoreLogo.png": 50,
	"Square44x44Logo.png": 44,
	"Square150x150Logo.png": 150,
	"LargeTile.png": 310,
};
for (const [name, size] of Object.entries(tiles)) {
	await square(size).toFile(path.join(outDir, name));
}

// Wide tile: the square logo centered on a 310x150 transparent canvas.
const wideLogo = await square(150).toBuffer();
await sharp({ create: { width: 310, height: 150, channels: 4, background: transparent } })
	.composite([{ input: wideLogo, left: Math.floor((310 - 150) / 2), top: 0 }])
	.png()
	.toFile(path.join(outDir, "Wide310x150Logo.png"));

// 2. Taskbar & app-list variants. altform-unplated tells Windows to draw the
//    icon with no background plate (otherwise it fills the plate with the system
//    accent color); the plain targetsize variants cover contexts that do plate.
const sizes = [16, 24, 32, 48, 256];
const forms = ["", "_altform-unplated", "_altform-lightunplated"];
for (const n of sizes) {
	const variant = square(n);
	for (const form of forms) {
		await variant.clone().toFile(path.join(outDir, `Square44x44Logo.targetsize-${n}${form}.png`));
	}
}

console.log(`Generated Windows Store assets in ${path.relative(root, outDir)} from ${path.relative(root, source)}`);
