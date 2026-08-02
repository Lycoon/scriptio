/**
 * Which OS the frontend is running on, from the user agent.
 *
 * Deliberately not keyed off `isTauri()`: these guard behaviours of the *OS*
 * (its document picker, its save dialog), which mobile browsers hit exactly the
 * same way the Tauri shells do. Kept free of React and of `@tauri-apps` imports
 * so adapters and other plain modules can use it.
 */

const ua = (): string => (typeof navigator === "undefined" ? "" : navigator.userAgent);

/**
 * True on iPhone/iPad/iPod. The `Macintosh` clause catches iPadOS, which reports
 * a desktop user agent but is still an iOS device in every way that matters here.
 */
export const isIOS = (): boolean => {
    if (typeof navigator === "undefined") return false;
    const agent = ua();
    return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
};

/** True on Android. */
export const isAndroid = (): boolean => /Android/.test(ua());

/**
 * True when a file input opens the OS document picker rather than a desktop file
 * dialog — neither of which can be filtered by our screenplay extensions.
 */
export const isMobileFilePicker = (): boolean => isIOS() || isAndroid();
