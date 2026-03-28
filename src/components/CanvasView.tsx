import { useRef, useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useCanvas } from "@/hooks/useCanvas";
import { useImages } from "@/hooks/useImages";
import { useShapes } from "@/hooks/useShapes";
import Toolbar from "@/components/Toolbar";
import BottomToolbar, { type Tool } from "@/components/BottomToolbar";
import CanvasImage from "@/components/CanvasImage";
import TextElement, { type TextShape } from "@/components/TextElement";
import ArrowElement, { type ArrowShape } from "@/components/ArrowElement";
import UploadZone from "@/components/UploadZone";
import { requestUploadUrl, uploadToS3, getImageDimensions } from "@/lib/s3";
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
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [drawState, setDrawState] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const canvas = useQuery(api.canvases.get, { id: canvasId });
  const renameMutation = useMutation(api.canvases.rename);
  const descriptionMutation = useMutation(api.images.setDescription);
  const descriptionAlignMutation = useMutation(api.images.setDescriptionAlign);

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
    shapes,
    setLocalPosition: setShapeLocalPosition,
    setLocalSize: setShapeLocalSize,
    setLocalArrow,
    commitMove: commitShapeMove,
    commitResize: commitShapeResize,
    commitMoveArrow,
    addMutation: addShapeMutation,
    setContentMutation,
    deleteMutation: deleteShapeMutation,
  } = useShapes(canvasId);

  const {
    viewport,
    onPointerDown: canvasPanDown,
    onPointerMove: canvasPanMove,
    onPointerUp: canvasPanUp,
    resetViewport,
    zoomIn,
    zoomOut,
    screenToCanvas,
  } = useCanvas(containerRef);

  function getMaxZIndex() {
    return Math.max(
      0,
      ...images.map((img) => img.zIndex),
      ...shapes.map((s) => s.zIndex)
    );
  }

  // Pointer handlers: route to pan OR draw based on active tool
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (activeTool === "select") {
      canvasPanDown(e);
      return;
    }
    if ((e.target as HTMLElement).dataset.canvasBg !== "true") return;
    const rect = containerRef.current!.getBoundingClientRect();
    const pos = screenToCanvas(e.clientX, e.clientY, rect);
    setDrawState({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (activeTool === "select") {
      canvasPanMove(e);
      return;
    }
    if (!drawState) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const pos = screenToCanvas(e.clientX, e.clientY, rect);
    setDrawState((d) => (d ? { ...d, currentX: pos.x, currentY: pos.y } : null));
  }

  async function handlePointerUp() {
    if (activeTool === "select") {
      canvasPanUp();
      return;
    }
    if (!drawState) return;
    const { startX, startY, currentX, currentY } = drawState;
    setDrawState(null);

    const maxZ = getMaxZIndex();

    if (activeTool === "text") {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.max(Math.abs(currentX - startX), 180);
      const h = Math.max(Math.abs(currentY - startY), 70);
      const id = await addShapeMutation({ canvasId, type: "text", x, y, w, h, zIndex: maxZ + 1 });
      setSelectedShapeId(id);
      setSelectedId(null);
    } else if (activeTool === "arrow") {
      const dx = currentX - startX;
      const dy = currentY - startY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const x2 = length < 20 ? startX + 150 : currentX;
      const y2 = length < 20 ? startY : currentY;
      const id = await addShapeMutation({
        canvasId,
        type: "arrow",
        x: startX,
        y: startY,
        x2,
        y2,
        zIndex: maxZ + 1,
      });
      setSelectedShapeId(id);
      setSelectedId(null);
    }

    setActiveTool("select");
  }

  // Deselect when clicking background
  function handleBackgroundClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).dataset.canvasBg === "true") {
      setSelectedId(null);
      setSelectedShapeId(null);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isDeleteKey = e.key === "Delete" || e.key === "Backspace";
      const notInInput =
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement);

      if (isDeleteKey && notInInput) {
        if (selectedId) {
          void deleteMutation({ id: selectedId as Id<"images"> });
          setSelectedId(null);
        }
        if (selectedShapeId) {
          void deleteShapeMutation({ id: selectedShapeId as Id<"shapes"> });
          setSelectedShapeId(null);
        }
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setSelectedShapeId(null);
        setActiveTool("select");
        setDrawState(null);
      }
      // Tool shortcuts
      if (notInInput) {
        if (e.key === "v" || e.key === "V") setActiveTool("select");
        if (e.key === "t" || e.key === "T") setActiveTool("text");
        if (e.key === "a" || e.key === "A") setActiveTool("arrow");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, selectedShapeId, deleteMutation, deleteShapeMutation]);

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

  const canvasCursor =
    activeTool === "select"
      ? "grab"
      : drawState
        ? "crosshair"
        : "crosshair";

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
            void processFilesDirect(files);
            e.target.value = "";
          }}
        />

        <div
          ref={containerRef}
          className="w-full h-full pt-[44px]"
          style={{ cursor: canvasCursor }}
          data-canvas-bg="true"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
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
                onSelect={() => { setSelectedId(img._id); setSelectedShapeId(null); }}
                onDeselect={() => setSelectedId(null)}
                onMoveOptimistic={setLocalPosition}
                onCommitMove={commitMove}
                onCommitResize={commitResize}
                onResizeOptimistic={setLocalSize}
                onDelete={deleteMutation}
                onBringToFront={() =>
                  void reorderMutation({ id: img._id, zIndex: getMaxZIndex() + 1 })
                }
                onSendToBack={() =>
                  void reorderMutation({ id: img._id, zIndex: 0 })
                }
                onDescriptionChange={(description) =>
                  void descriptionMutation({ id: img._id, description })
                }
                onDescriptionAlignChange={(align) =>
                  void descriptionAlignMutation({ id: img._id, align })
                }
              />
            ))}

            {shapes.map((shape) => {
              if (
                shape.type === "text" &&
                shape.w !== undefined &&
                shape.h !== undefined
              ) {
                return (
                  <TextElement
                    key={shape._id}
                    shape={shape as TextShape}
                    selected={selectedShapeId === shape._id}
                    scale={viewport.scale}
                    onSelect={() => { setSelectedShapeId(shape._id); setSelectedId(null); }}
                    onMoveOptimistic={setShapeLocalPosition}
                    onCommitMove={commitShapeMove}
                    onResizeOptimistic={setShapeLocalSize}
                    onCommitResize={commitShapeResize}
                    onContentChange={(id, content) => void setContentMutation({ id, content })}
                    onDelete={(id) => void deleteShapeMutation({ id })}
                  />
                );
              }
              if (
                shape.type === "arrow" &&
                shape.x2 !== undefined &&
                shape.y2 !== undefined
              ) {
                return (
                  <ArrowElement
                    key={shape._id}
                    shape={shape as ArrowShape}
                    selected={selectedShapeId === shape._id}
                    scale={viewport.scale}
                    onSelect={() => { setSelectedShapeId(shape._id); setSelectedId(null); }}
                    onMoveOptimistic={setLocalArrow}
                    onCommitMove={commitMoveArrow}
                  />
                );
              }
              return null;
            })}

            {/* Draw preview */}
            {drawState && activeTool === "text" && (
              <div
                style={{
                  position: "absolute",
                  left: Math.min(drawState.startX, drawState.currentX),
                  top: Math.min(drawState.startY, drawState.currentY),
                  width: Math.abs(drawState.currentX - drawState.startX),
                  height: Math.abs(drawState.currentY - drawState.startY),
                  border: "2px dashed #3b82f6",
                  backgroundColor: "rgba(59, 130, 246, 0.05)",
                  borderRadius: 4,
                  pointerEvents: "none",
                }}
              />
            )}

            {drawState && activeTool === "arrow" && (
              <svg
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 0,
                  height: 0,
                  overflow: "visible",
                  pointerEvents: "none",
                }}
              >
                <defs>
                  <marker
                    id="preview-arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                  </marker>
                </defs>
                <line
                  x1={drawState.startX}
                  y1={drawState.startY}
                  x2={drawState.currentX}
                  y2={drawState.currentY}
                  stroke="#3b82f6"
                  strokeWidth={2 / viewport.scale}
                  strokeDasharray={`${5 / viewport.scale} ${5 / viewport.scale}`}
                  markerEnd="url(#preview-arrowhead)"
                />
              </svg>
            )}
          </div>

          {/* Empty canvas state */}
          {images.length === 0 && shapes.length === 0 && (
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

      <BottomToolbar activeTool={activeTool} onSelectTool={setActiveTool} />
    </div>
  );

  async function processFilesDirect(files: FileList) {
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
          const [{ uploadUrl, storageKey }, { width, height }] = await Promise.all([
            requestUploadUrl({ filename: file.name, mimeType: file.type, canvasId }),
            getImageDimensions(file),
          ]);
          await uploadToS3(file, uploadUrl, (pct) => {
            toast.loading(`Uploading ${file.name}… ${Math.round(pct * 100)}%`, {
              id: toastId,
            });
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
