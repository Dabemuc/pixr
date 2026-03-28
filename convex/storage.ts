import { httpAction, internalAction } from "./_generated/server";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v } from "convex/values";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function corsJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function getS3Client() {
  return new S3Client({
    region: process.env.S3_REGION!,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function getBucket() {
  return process.env.S3_BUCKET!;
}

export const getUploadUrl = httpAction(async (_ctx, request) => {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  try {
    const { filename, mimeType, canvasId } = (await request.json()) as {
      filename: string;
      mimeType: string;
      canvasId: string;
    };
    const storageKey = `${canvasId}/${Date.now()}-${filename}`;
    const client = getS3Client();
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: storageKey,
        ContentType: mimeType,
      }),
      { expiresIn: 300 }
    );
    return corsJson({ uploadUrl: url, storageKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return corsJson({ error: message }, 500);
  }
});

export const getImageUrl = httpAction(async (_ctx, request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!key) return corsJson({ error: "Missing key" }, 400);

    const client = getS3Client();
    const signedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: getBucket(), Key: key }),
      { expiresIn: 3600 }
    );
    return corsJson({ url: signedUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return corsJson({ error: message }, 500);
  }
});

export const deleteObjects = internalAction({
  args: { keys: v.array(v.string()) },
  handler: async (_ctx, { keys }) => {
    const client = getS3Client();
    await Promise.all(
      keys.map((Key) =>
        client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key }))
      )
    );
  },
});
