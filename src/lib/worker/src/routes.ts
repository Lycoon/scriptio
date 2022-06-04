import { Router } from "itty-router";
import render from "render2";

interface Env {
  AUTH_KEY: string;
  R2_BUCKET: R2Bucket;
  CACHE_CONTROL?: string;
}

const router = Router();

const getFile = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> => {
  const url = new URL(request.url);
  const id = url.pathname.slice(6);
  console.log("url: ", url);
  console.log("id: ", id);

  const notFound = (error: any) =>
    new Response(
      JSON.stringify({
        success: false,
        error: error ?? "Not Found",
      }),
      {
        status: 404,
        headers: {
          "content-type": "application/json",
        },
      }
    );
  if (!id) {
    return notFound("Missing ID");
  }

  const imageReq = new Request(`https://r2host/${id}`, request);
  return render.fetch(
    imageReq,
    {
      ...env,
      CACHE_CONTROL: "public, max-age=604800",
    },
    ctx
  );
};

router.get("/upload/:id", getFile);
router.get("/file/*", getFile);
router.head("/file/*", getFile);

export { router };
