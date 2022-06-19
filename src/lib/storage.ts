import {
    DeleteObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { env } from "process";

const client = new S3Client({
    region: "GRA",
    endpoint: `https://s3.gra.cloud.ovh.net`,
    credentials: {
        accessKeyId: env.S3_ACCESS!,
        secretAccessKey: env.S3_SECRET!,
    },
});

export const uploadObject = async (name: string, data: string) => {
    const params = {
        Bucket: env.S3_BUCKET,
        Key: name,
        Body: Buffer.from(
            data.substring("data:image/jpeg;base64,".length),
            "base64"
        ),
        ContentType: "image/jpeg",
    };

    try {
        const data = await client.send(new PutObjectCommand(params));
        return data;
    } catch (e: any) {
        console.log(e);
    }
};

export const deleteObject = async (name: string) => {
    const params = {
        Bucket: env.S3_BUCKET,
        Key: name,
    };

    try {
        const data = await client.send(new DeleteObjectCommand(params));
        return data;
    } catch (e: any) {
        console.log(e);
    }
};
