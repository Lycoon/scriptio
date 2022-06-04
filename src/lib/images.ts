import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "process";
import { Readable } from "stream";

const client = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_KEY_ID!, secretAccessKey: env.R2_SECRET! },
});

export const getObject = async (name: string) => {
  const params = {
    Bucket: "scriptio",
    Key: name,
  };

  return new Promise(async (resolve, reject) => {
    const data = await client.send(new GetObjectCommand(params));

    try {
      // Store all of data chunks returned from the response data stream
      // into an array then use Array#join() to use the returned contents as a String
      const body = data.Body! as Readable;
      let responseDataChunks: any[] = [];

      // Handle an error while streaming the response body
      body.once("error", (err: any) => reject(err));

      // Attach a 'data' listener to add the chunks of data to our array
      // Each chunk is a Buffer instance
      body.on("data", (chunk: any) => responseDataChunks.push(chunk));

      // Once the stream has no more data, join the chunks into a string and return the string
      body.once("end", () => resolve(responseDataChunks.join("")));
    } catch (err) {
      // Handle the error or throw
      return reject(err);
    }

    return data;
  });
};

export const uploadObject = async (name: string, content: any) => {
  const params = {
    Bucket: "scriptio",
    Key: name,
    Body: content, // const fileStream = fs.createReadStream(file);
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
    Bucket: "scriptio",
    Key: name,
  };

  try {
    const data = await client.send(new DeleteObjectCommand(params));
    return data;
  } catch (e: any) {
    console.log(e);
  }
};
