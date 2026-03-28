import { useRef, useState } from "react";
import { toast } from "sonner";
import { requestUploadUrl, uploadToS3, preprocessImage, replaceExtension } from "@/lib/s3";
import type { Id } from "../../convex/_generated/dataModel";
import type { Viewport } from "@/hooks/useCanvas";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_CANVAS_WIDTH = 600;

interface UploadZoneProps {
  canvasId: Id<"canvases">;
  viewport: Viewport;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onUpload: (params: {
    storageKey: string;
    filename: string;
    mimeType: string;
    width: number;
    height: number;
    x: number;
    y: number;
    w: number;
    h: number;
  }) => Promise<void>;
  children: React.ReactNode;
}

export default function UploadZone({
  canvasId,
  viewport,
  containerRef,
  onUpload,
  children,
}: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function getDropPosition(): { x: number; y: number } {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    return {
      x: (cx - viewport.x) / viewport.scale,
      y: (cy - viewport.y) / viewport.scale,
    };
  }

  async function processFiles(files: FileList | File[]) {
    const validFiles = Array.from(files).filter((file) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: unsupported file type`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: exceeds 20MB limit`);
        return false;
      }
      return true;
    });

    const center = getDropPosition();

    await Promise.all(
      validFiles.map(async (file, i) => {
        const toastId = toast.loading(`Processing ${file.name}…`);
        try {
          const { blob, width, height, mimeType: outputMimeType } =
            await preprocessImage(file);
          const outputFilename = replaceExtension(file.name, outputMimeType);

          toast.loading(`Uploading ${file.name}…`, { id: toastId });
          const { uploadUrl, storageKey } = await requestUploadUrl({
            filename: outputFilename,
            mimeType: outputMimeType,
            canvasId,
            fileSizeBytes: blob.size,
          });

          await uploadToS3(blob, outputMimeType, uploadUrl, (pct) => {
            toast.loading(`Uploading ${file.name}… ${Math.round(pct * 100)}%`, {
              id: toastId,
            });
          });

          // Scale to max canvas width while preserving aspect ratio
          const aspect = height / width;
          const w = Math.min(width, MAX_CANVAS_WIDTH);
          const h = Math.round(w * aspect);

          // Offset each image slightly so they don't all stack
          const offsetX = i * 20;
          const offsetY = i * 20;

          await onUpload({
            storageKey,
            filename: file.name,
            mimeType: outputMimeType,
            width,
            height,
            x: center.x - w / 2 + offsetX,
            y: center.y - h / 2 + offsetY,
            w,
            h,
          });

          toast.success(`${file.name} uploaded`, { id: toastId });
        } catch (err) {
          toast.error(
            `${file.name}: ${err instanceof Error ? err.message : "Upload failed"}`,
            { id: toastId }
          );
        }
      })
    );
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear if leaving the outer container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    void processFiles(e.dataTransfer.files);
  }

  return (
    <div
      className="relative w-full h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-none">
          <div className="bg-background rounded-xl px-8 py-6 shadow-xl text-center">
            <p className="text-lg font-semibold text-primary">Drop images here</p>
            <p className="text-sm text-muted-foreground mt-1">
              JPEG, PNG, GIF, WebP — up to 20 MB each
            </p>
          </div>
        </div>
      )}

      {/* Hidden file input for toolbar Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void processFiles(e.target.files);
          e.target.value = "";
          e.target.blur();
        }}
      />
    </div>
  );
}

// Export a ref-forwarding helper so Toolbar can trigger the file picker
export function useUploadTrigger(
  uploadZoneRef: React.RefObject<HTMLInputElement | null>
) {
  return () => uploadZoneRef.current?.click();
}
