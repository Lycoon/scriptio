import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "process";

const client = new S3Client({
    region: "GRA",
    endpoint: `https://s3.gra.cloud.ovh.net`,
    credentials: {
        accessKeyId: env.S3_ACCESS!,
        secretAccessKey: env.S3_SECRET!,
    },
});

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
