import {
    DeleteObjectCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "process";

export const S3_ENDPOINT = `https://${env.S3_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const client = new S3Client({
    region: "auto",
    endpoint: S3_ENDPOINT,
    credentials: {
        accessKeyId: env.S3_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
    },
});

export const getSignedDownloadUrl = async (name: string, expiresIn = 900): Promise<string | null> => {
    const params = {
        Bucket: env.S3_BUCKET,
        Key: name,
    };

    try {
        const command = new GetObjectCommand(params);
        return await getSignedUrl(client, command, { expiresIn });
    } catch (e) {
        console.error("An error occurred while getting signed download URL from S3: ", e);
        return null;
    }
};

export const upload = async (name: string, data: string): Promise<boolean> => {
    const params = {
        Bucket: env.S3_BUCKET,
        Key: name,
        Body: Buffer.from(data.substring("data:image/jpeg;base64,".length), "base64"),
        ContentType: "image/jpeg",
    };

    try {
        await client.send(new PutObjectCommand(params));
        return true;
    } catch (e) {
        console.error("An error occurred while uploading object to S3: ", e);
        return false;
    }
};

export const destroy = async (name: string): Promise<boolean> => {
    const params = {
        Bucket: env.S3_BUCKET,
        Key: name,
    };

    try {
        await client.send(new DeleteObjectCommand(params));
        return true;
    } catch (e) {
        console.error("An error occurred while destroying object from S3: ", e);
        return false;
    }
};

/** Read an object's raw bytes (null if missing). Used to proxy private assets
 *  through the same-origin API, avoiding R2 CORS configuration. */
export const getObjectBytes = async (key: string): Promise<Uint8Array | null> => {
    try {
        const res = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
        if (!res.Body) return null;
        return await res.Body.transformToByteArray();
    } catch (e) {
        console.error("An error occurred while reading object from S3: ", e);
        return null;
    }
};

/** Upload raw bytes under `key` (generic binary, e.g. board image/audio assets). */
export const putObject = async (
    key: string,
    body: Uint8Array | Buffer,
    contentType: string,
): Promise<boolean> => {
    const params = {
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
    };

    try {
        await client.send(new PutObjectCommand(params));
        return true;
    } catch (e) {
        console.error("An error occurred while uploading object to S3: ", e);
        return false;
    }
};

/**
 * Delete every object under a prefix (best-effort).
 *
 * Authoritative where `destroyMany` is not: it deletes what the bucket actually
 * holds rather than what the database remembers, so objects whose tracking row
 * was lost still get reclaimed.
 *
 * The prefix must end with "/" — a bare prefix would also match sibling keys
 * that merely start with the same characters, and an empty one would target
 * the whole bucket.
 */
export const destroyPrefix = async (prefix: string): Promise<boolean> => {
    if (!prefix.endsWith("/")) {
        console.error(`Refusing to destroy S3 prefix "${prefix}": must end with "/"`);
        return false;
    }

    try {
        let continuationToken: string | undefined;

        do {
            const listed = await client.send(
                new ListObjectsV2Command({
                    Bucket: env.S3_BUCKET,
                    Prefix: prefix,
                    ContinuationToken: continuationToken,
                }),
            );

            // ListObjectsV2 pages at 1000 keys, the same cap DeleteObjects takes.
            const keys = listed.Contents?.flatMap((o) => (o.Key ? [{ Key: o.Key }] : [])) ?? [];
            if (keys.length > 0) {
                await client.send(
                    new DeleteObjectsCommand({
                        Bucket: env.S3_BUCKET,
                        Delete: { Objects: keys },
                    }),
                );
            }

            continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
        } while (continuationToken);

        return true;
    } catch (e) {
        console.error("An error occurred while destroying an S3 prefix: ", e);
        return false;
    }
};

/** Delete many objects at once (best-effort). No-op on an empty list. */
export const destroyMany = async (keys: string[]): Promise<boolean> => {
    if (keys.length === 0) return true;

    const params = {
        Bucket: env.S3_BUCKET,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
    };

    try {
        await client.send(new DeleteObjectsCommand(params));
        return true;
    } catch (e) {
        console.error("An error occurred while destroying objects from S3: ", e);
        return false;
    }
};
