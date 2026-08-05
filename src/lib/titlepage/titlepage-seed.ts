import * as Y from "yjs";
import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";

import { DEFAULT_TITLEPAGE_CONTENT, TitlePageSchema } from "./editor";
import type { ProjectState } from "../project/project-doc";

/**
 * Idempotent seeding of the default title page.
 *
 * Writing the template with `editor.commands.setContent` (or any plain
 * fragment insert) is *not* safe in a collaborative doc: two clients that both
 * observe an empty title page each insert their own copy, and CRDT merge keeps
 * both — the "randomly duplicated title page" bug. The empty-fragment check
 * can't prevent it, because each client only sees its own local state at the
 * moment it decides to seed (fresh device before the cloud sync lands, a
 * second collaborator opening the panel at the same time, an offline device
 * reconnecting later…).
 *
 * So the template is not built per client. It is encoded **once** as a canned
 * Yjs update whose structs all belong to a synthetic client id derived from
 * the template itself. Yjs identifies structs by `(client, clock)` and skips
 * the ones it already knows, so applying that update any number of times, from
 * any number of clients, in any order, converges to exactly one copy:
 *
 *   - re-applying it to the same doc is a no-op;
 *   - two clients seeding concurrently produce byte-identical structs, so the
 *     merge is the identity;
 *   - a doc where the seed was already edited or deleted keeps those edits —
 *     the late seed carries no new structs, and the peer's deletions apply to
 *     the very same ids.
 */

/**
 * Root type name holding the title-page fragment. Must match
 * `ProjectState.KEYS.TITLEPAGE` (which is an instance field, so it can't be
 * read statically); `titlepage-seed.test.ts` guards the two staying in sync.
 */
const TITLEPAGE_ROOT = "titlepage";

/**
 * Transaction origin of a seed. Deliberately outside the editor's
 * `trackedOrigins`, so undo can't roll the template back out of the doc.
 */
export const TITLEPAGE_SEED_ORIGIN = "titlepage-seed";

/** Encode the default template into a standalone update owned by `clientId`. */
const encodeTemplate = (clientId: number): Uint8Array => {
    const doc = new Y.Doc();
    doc.clientID = clientId;
    prosemirrorJSONToYXmlFragment(
        TitlePageSchema,
        { type: "doc", content: DEFAULT_TITLEPAGE_CONTENT },
        doc.getXmlFragment(TITLEPAGE_ROOT),
    );
    const update = Y.encodeStateAsUpdate(doc);
    doc.destroy();
    return update;
};

/** FNV-1a, 32 bits. */
const hash32 = (bytes: Uint8Array): number => {
    let hash = 0x811c9dc5;
    for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

let cachedSeed: Uint8Array | null = null;

/**
 * The canned seed update, built once per session.
 *
 * The synthetic client id is `2^32 + hash(template)`:
 *   - above 2^32 it can never collide with a real client id (Yjs draws those
 *     from `random.uint32()`), and lib0's varint codec handles any safe
 *     integer, so the id round-trips through the wire format;
 *   - deriving it from the encoded bytes means a change to
 *     `DEFAULT_TITLEPAGE_CONTENT` (or to the title-page schema) automatically
 *     yields a different id. Two bundles with different templates then seed
 *     under different ids — worst case both templates land in a doc seeded
 *     concurrently across a deploy, instead of two versions silently claiming
 *     the same struct ids, which would corrupt the fragment.
 */
export const titlePageSeedUpdate = (): Uint8Array => {
    if (!cachedSeed) {
        // First pass under a fixed placeholder id so the bytes fed to the hash
        // depend on the template alone, not on a random client id.
        cachedSeed = encodeTemplate(2 ** 32 + hash32(encodeTemplate(0)));
    }
    return cachedSeed;
};

/**
 * Write the default title page into `ydoc` when it has none. Safe to call from
 * any client at any time — see the note at the top of this file.
 *
 * Returns whether the seed was applied (i.e. the title page was empty).
 */
export const seedTitlePage = (ydoc: ProjectState): boolean => {
    if (ydoc.isReadOnly) return false;
    if (ydoc.titlepageFragment().length > 0) return false;
    Y.applyUpdate(ydoc, titlePageSeedUpdate(), TITLEPAGE_SEED_ORIGIN);
    return true;
};
