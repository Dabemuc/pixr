// Local dev: Convex sets VITE_CONVEX_SITE_URL directly (same host, HTTP).
// Cloud prod: HTTP actions are at .convex.site instead of .convex.cloud.
const convexSiteUrl =
  (import.meta.env.VITE_CONVEX_SITE_URL as string | undefined) ??
  (import.meta.env.VITE_CONVEX_URL as string | undefined)?.replace(
    ".convex.cloud",
    ".convex.site"
  );

export async function requestUploadUrl(params: {
  filename: string;
  mimeType: string;
  canvasId: string;
  fileSizeBytes?: number;
}): Promise<{ uploadUrl: string; storageKey: string }> {
  const res = await fetch(`${convexSiteUrl}/api/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to get upload URL: ${res.statusText}`);
  return res.json() as Promise<{ uploadUrl: string; storageKey: string }>;
}

export async function requestImageUrl(storageKey: string): Promise<string> {
  const res = await fetch(
    `${convexSiteUrl}/api/image-url?key=${encodeURIComponent(storageKey)}`
  );
  if (!res.ok) throw new Error(`Failed to get image URL: ${res.statusText}`);
  const data = (await res.json()) as { url: string };
  return data.url;
}

export function uploadToS3(
  blob: Blob,
  contentType: string,
  uploadUrl: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(e.loaded / e.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(blob);
  });
}

export function getImageDimensions(
  file: File | Blob
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image dimensions"));
    };
    img.src = objectUrl;
  });
}

// Detect WebP support once at module load time
const _webpSupported: boolean = (() => {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  return c.toDataURL("image/webp").startsWith("data:image/webp");
})();

async function isAnimatedGif(file: File): Promise<boolean> {
  const buf = await file.slice(0, 65536).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let count = 0;
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) {
      if (++count > 1) return true;
    }
  }
  return false;
}

export function replaceExtension(filename: string, mimeType: string): string {
  const ext =
    mimeType === "image/webp" ? ".webp" :
    mimeType === "image/jpeg" ? ".jpg" :
    mimeType === "image/gif" ? ".gif" : ".png";
  return filename.replace(/\.[^/.]+$/, "") + ext;
}

export async function preprocessImage(file: File): Promise<{
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
}> {
  // Pass animated GIFs through unchanged — canvas would flatten to first frame
  if (file.type === "image/gif" && (await isAnimatedGif(file))) {
    const { width, height } = await getImageDimensions(file);
    return { blob: file, width, height, mimeType: file.type };
  }

  const { width: origW, height: origH } = await getImageDimensions(file);

  const MAX_W = 3840;
  const MAX_H = 2160;
  const scale = Math.min(1, MAX_W / origW, MAX_H / origH);
  const outW = Math.round(origW * scale);
  const outH = Math.round(origH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  // Drawing through the canvas pipeline naturally strips EXIF metadata
  await new Promise<void>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      ctx.drawImage(img, 0, 0, outW, outH);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for preprocessing"));
    };
    img.src = objectUrl;
  });

  const outputMimeType = _webpSupported ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("canvas.toBlob timed out")),
      30_000
    );
    canvas.toBlob(
      (b) => {
        clearTimeout(timer);
        if (!b) reject(new Error("canvas.toBlob returned null"));
        else resolve(b);
      },
      outputMimeType,
      0.85
    );
  });

  return { blob, width: outW, height: outH, mimeType: outputMimeType };
}
