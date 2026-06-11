/**
 * SHA-256 hashing for content-addressed assets.
 *
 * Assets (board images) are keyed by the hex SHA-256 of their bytes so the same
 * image dropped twice is stored once. Uses the Web Crypto API, available in both
 * the browser and the Tauri webview. This is the single client-side hashing
 * helper — reuse it for the future cloud R2 upload path too.
 */

/** Hex SHA-256 digest of a byte buffer. */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
}
