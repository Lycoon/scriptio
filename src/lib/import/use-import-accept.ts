"use client";

import { useSyncExternalStore } from "react";

import { getSupportedImportExtensions } from "@src/lib/adapters/registry";
import { isMobileFilePicker } from "@src/lib/utils/platform";

/**
 * `accept` value for the screenplay import file inputs, or `undefined` to leave
 * the attribute off entirely.
 *
 * Neither mobile picker can be filtered by our extensions, and each fails
 * differently enough to look like two bugs:
 *
 * - Android resolves the accept list to MIME types before opening the Storage
 *   Access Framework picker (`WebChromeClient.onShowFileChooser` →
 *   `MimeTypeMap.getMimeTypeFromExtension`). It knows none of `.fdx`,
 *   `.fountain`, `.scriptio`, `.fadein` or `.wdz`, so they all drop out and only
 *   `.txt` → text/plain survives as the filter. The picker still *lists* every
 *   file — it just refuses to return the ones outside that filter, so tapping a
 *   .fdx does nothing at all and reads as a permission problem.
 * - iOS turns each entry into a UTType; unknown extensions become dynamic UTIs
 *   that conform to nothing, and UIDocumentPickerViewController greys those
 *   files out.
 *
 * Dropping the attribute is what both document as "no filter": Android's
 * `createIntent()` falls back to a wildcard intent type and skips the
 * `EXTRA_MIME_TYPES` branch entirely, and WebKit falls back to `public.item`
 * once no usable type resolves. An explicit wildcard `accept` works on Android
 * but is a gamble on iOS, where it is not a real media type and can resolve to
 * yet another unmatchable dynamic UTI — leaving *everything* greyed out.
 *
 * Nothing is lost by not filtering: `getImportAdapterByFilename` already
 * rejects what it cannot read, the same error path a wrong file takes anywhere
 * else. Desktop and web keep the extension list, where it works as intended.
 *
 * Read through `useSyncExternalStore` so the server snapshot (the extension
 * list) is what hydration matches against, and the user-agent answer only lands
 * on the re-render after — reading `navigator` during the first client render
 * would disagree with the SSR HTML. The value never changes afterwards, so
 * `subscribe` has nothing to listen to.
 */
const subscribe = () => () => {};

const acceptForThisDevice = (): string | undefined =>
    isMobileFilePicker() ? undefined : getSupportedImportExtensions();

export const useImportAccept = (): string | undefined =>
    useSyncExternalStore(subscribe, acceptForThisDevice, getSupportedImportExtensions);
