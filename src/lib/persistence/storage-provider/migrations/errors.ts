/**
 * Typed errors for storage-level migrations. Surfaced to the UI so users
 * see actionable messages instead of opaque IndexedDB exceptions.
 */

export class StoreVersionTooNewError extends Error {
    readonly storedVersion: number;
    readonly expectedVersion: number;

    constructor(storedVersion: number, expectedVersion: number) {
        super(
            `Stored IndexedDB schema version (${storedVersion}) is newer than the app expects (${expectedVersion}). Update the app to open this data.`,
        );
        this.name = "StoreVersionTooNewError";
        this.storedVersion = storedVersion;
        this.expectedVersion = expectedVersion;
    }
}

export class StoreMigrationFailedError extends Error {
    readonly fromVersion: number;
    readonly failedAt: number;
    readonly cause: unknown;

    constructor(fromVersion: number, failedAt: number, cause: unknown) {
        super(`IndexedDB schema migration ${fromVersion} → ${failedAt} failed: ${String(cause)}`);
        this.name = "StoreMigrationFailedError";
        this.fromVersion = fromVersion;
        this.failedAt = failedAt;
        this.cause = cause;
    }
}
