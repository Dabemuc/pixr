import { useRef, useState, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCanvas } from "@/hooks/useCanvas";
import { useImages } from "@/hooks/useImages";
import { useQuery } from "convex/react";
import Toolbar from "@/components/Toolbar";
import CanvasImage from "@/components/CanvasImage";
import UploadZone from "@/components/UploadZone";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";

interface CanvasViewProps {
  canvasId: Id<"canvases">;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function CanvasView({
  canvasId,
  sidebarOpen,
  onToggleSidebar,
}: CanvasViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canvas = useQuery(api.canvases.get, { id: canvasId });
  const renameMutation = useMutation(api.canvases.rename);

  const {
    images,
    setLocalPosition,
    setLocalSize,
    commitMove,
    commitResize,
    reorderMutation,
    deleteMutation,
    addMutation,
  } = useImages(canvasId);

  const {
    viewport,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    resetViewport,
    zoomIn,
    zoomOut,
    screenToCanvas,
  } = useCanvas(containerRef);

  // Deselect when clicking background
  function handleBackgroundClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).dataset.canvasBg === "true") {
      setSelectedId(null);
    }
  }

  // Keyboard: Delete selected image
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        selectedId &&
        (e.key === "Delete" || e.key === "Backspace") &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        void deleteMutation({ id: selectedId as Id<"images"> });
        setSelectedId(null);
      }
      if (e.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, deleteMutation]);

  const handleUpload = useCallback(
    async (params: {
      storageKey: string;
      filename: string;
      mimeType: string;
      width: number;
      height: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }) => {
      try {
        await addMutation({ canvasId, ...params });
      } catch (err) {
        toast.error(
          `Failed to add image: ${err instanceof Error ? err.message : "Unknown error"}`
        );
        throw err;
      }
    },
    [addMutation, canvasId]
  );

  function handleRenameCanvas(name: string) {
    void renameMutation({ id: canvasId, name }).catch((err: unknown) => {
      toast.error(
        `Failed to rename: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    });
  }

  function getMaxZIndex() {
    return images.reduce((m, img) => Math.max(m, img.zIndex), 0);
  }

  const _screenToCanvas = screenToCanvas;
  void _screenToCanvas;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <Toolbar
        canvasName={canvas?.name ?? "Loading…"}
        onRenameCanvas={handleRenameCanvas}
        scale={viewport.scale}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={resetViewport}
        onUpload={() => fileInputRef.current?.click()}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
      />

      <UploadZone
        canvasId={canvasId}
        viewport={viewport}
        containerRef={containerRef}
        onUpload={handleUpload}
      >
        {/* Hidden file input wired to toolbar Upload button */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            if (!e.target.files) return;
            const files = e.target.files;
            // Dispatch a synthetic drop to UploadZone via DataTransfer isn't easy;
            // instead process directly here
            void processFilesDirect(files);
            e.target.value = "";
          }}
        />

        <div
          ref={containerRef}
          className="w-full h-full pt-[44px]"
          style={{ cursor: "grab" }}
          data-canvas-bg="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={handleBackgroundClick}
        >
          {/* Infinite canvas inner container */}
          <div
            data-canvas-bg="true"
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              transformOrigin: "0 0",
              position: "absolute",
              width: 0,
              height: 0,
            }}
          >
            {images.map((img) => (
              <CanvasImage
                key={img._id}
                image={img}
                selected={selectedId === img._id}
                scale={viewport.scale}
                onSelect={() => setSelectedId(img._id)}
                onDeselect={() => setSelectedId(null)}
                onMoveOptimistic={setLocalPosition}
                onCommitMove={commitMove}
                onCommitResize={commitResize}
                onResizeOptimistic={setLocalSize}
                onDelete={deleteMutation}
                onBringToFront={() =>
                  void reorderMutation({
                    id: img._id,
                    zIndex: getMaxZIndex() + 1,
                  })
                }
                onSendToBack={() =>
                  void reorderMutation({ id: img._id, zIndex: 0 })
                }
              />
            ))}
          </div>

          {/* Empty canvas state */}
          {images.length === 0 && (
            <div
              data-canvas-bg="true"
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="text-center text-muted-foreground select-none">
                <ImagePlus className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium opacity-50">
                  Drop images here or click Upload
                </p>
              </div>
            </div>
          )}
        </div>
      </UploadZone>
    </div>
  );

  async function processFilesDirect(files: FileList) {
    const { requestUploadUrl, uploadToS3, getImageDimensions } = await import(
      "@/lib/s3"
    );
    const ACCEPTED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const MAX_SIZE = 20 * 1024 * 1024;
    const MAX_W = 600;

    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 400;
    const cy = rect ? rect.height / 2 : 300;
    const center = {
      x: (cx - viewport.x) / viewport.scale,
      y: (cy - viewport.y) / viewport.scale,
    };

    await Promise.all(
      Array.from(files).map(async (file, i) => {
        if (!ACCEPTED.includes(file.type)) {
          toast.error(`${file.name}: unsupported type`);
          return;
        }
        if (file.size > MAX_SIZE) {
          toast.error(`${file.name}: exceeds 20MB`);
          return;
        }
        const toastId = toast.loading(`Uploading ${file.name}…`);
        try {
          const [{ uploadUrl, storageKey }, { width, height }] =
            await Promise.all([
              requestUploadUrl({ filename: file.name, mimeType: file.type, canvasId }),
              getImageDimensions(file),
            ]);
          await uploadToS3(file, uploadUrl, (pct) => {
            toast.loading(`Uploading ${file.name}… ${Math.round(pct * 100)}%`, { id: toastId });
          });
          const aspect = height / width;
          const w = Math.min(width, MAX_W);
          const h = Math.round(w * aspect);
          await handleUpload({
            storageKey,
            filename: file.name,
            mimeType: file.type,
            width,
            height,
            x: center.x - w / 2 + i * 20,
            y: center.y - h / 2 + i * 20,
            w,
            h,
          });
          toast.success(`${file.name} uploaded`, { id: toastId });
        } catch (err) {
          toast.error(
            `${file.name}: ${err instanceof Error ? err.message : "Failed"}`,
            { id: toastId }
          );
        }
      })
    );
  }
}
