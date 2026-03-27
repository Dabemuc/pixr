import { httpAction, httpRouter } from "convex/server";
import { getUploadUrl, getImageUrl } from "./storage";

const http = httpRouter();

http.route({
  path: "/api/upload-url",
  method: "POST",
  handler: getUploadUrl,
});

http.route({
  path: "/api/upload-url",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

http.route({
  path: "/api/image-url",
  method: "GET",
  handler: getImageUrl,
});

export default http;
