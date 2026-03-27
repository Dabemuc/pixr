// Convex HTTP actions are served at .convex.site (not .convex.cloud)
const convexSiteUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined)
  ?.replace(".convex.cloud", ".convex.site")
  ?.replace("http://", "https://");

export async function requestUploadUrl(params: {
  filename: string;
  mimeType: string;
  canvasId: string;
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
  file: File,
  uploadUrl: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
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
    xhr.send(file);
  });
}

export function getImageDimensions(
  file: File
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
