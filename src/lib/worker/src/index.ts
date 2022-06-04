import { router } from "./routes";

/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  MY_BUCKET: R2Bucket;
}

export default {
  fetch: router.handle,
};
