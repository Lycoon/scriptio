import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "process";

const client = new S3Client({
    region: "auto",
    endpoint: `https://${env.S3_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: env.S3_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
    },
});

export const getSignedDownloadUrl = async (name: string): Promise<string | null> => {
    const params = {
        Bucket: env.S3_BUCKET,
        Key: name,
    };

    try {
        const command = new GetObjectCommand(params);
        return await getSignedUrl(client, command, { expiresIn: 900 });
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
