import { useEffect, useRef, useState } from "react";
import { requestImageUrl } from "@/lib/s3";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ImageOff } from "lucide-react";

interface ImageData {
  _id: Id<"images">;
  storageKey: string;
  filename: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
}

interface CanvasImageProps {
  image: ImageData;
  selected: boolean;
  scale: number;
  onSelect: () => void;
  onDeselect: () => void;
  onMoveOptimistic: (id: string, x: number, y: number) => void;
  onCommitMove: (id: Id<"images">, x: number, y: number) => Promise<void>;
  onCommitResize: (
    id: Id<"images">,
    x: number,
    y: number,
    w: number,
    h: number
  ) => Promise<void>;
  onResizeOptimistic: (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number
  ) => void;
  onDelete: (args: { id: Id<"images"> }) => Promise<void | null>;
  onBringToFront: () => void;
  onSendToBack: () => void;
}

type ResizeHandle =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nw-resize",
  n: "n-resize",
  ne: "ne-resize",
  e: "e-resize",
  se: "se-resize",
  s: "s-resize",
  sw: "sw-resize",
  w: "w-resize",
};

const MIN_SIZE = 50;

export default function CanvasImage({
  image,
  selected,
  scale,
  onSelect,
  onDeselect,
  onMoveOptimistic,
  onCommitMove,
  onCommitResize,
  onResizeOptimistic,
  onDelete,
  onBringToFront,
  onSendToBack,
}: CanvasImageProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const isDragging = useRef(false);
  const isResizing = useRef<ResizeHandle | null>(null);
  const dragStart = useRef({ px: 0, py: 0, ix: 0, iy: 0 });
  const resizeStart = useRef({ px: 0, py: 0, ix: 0, iy: 0, iw: 0, ih: 0 });

  useEffect(() => {
    let cancelled = false;
    requestImageUrl(image.storageKey)
      .then((url) => { if (!cancelled) setSignedUrl(url); })
      .catch(() => { if (!cancelled) setImgError(true); });
    return () => { cancelled = true; };
  }, [image.storageKey]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.button !== 0) return;

    if (!selected) {
      onSelect();
      return;
    }

    isDragging.current = true;
    dragStart.current = {
      px: e.clientX,
      py: e.clientY,
      ix: image.x,
      iy: image.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current && !isResizing.current) return;

    if (isDragging.current) {
      const dx = (e.clientX - dragStart.current.px) / scale;
      const dy = (e.clientY - dragStart.current.py) / scale;
      onMoveOptimistic(
        image._id,
        dragStart.current.ix + dx,
        dragStart.current.iy + dy
      );
    }

    if (isResizing.current) {
      const dx = (e.clientX - resizeStart.current.px) / scale;
      const dy = (e.clientY - resizeStart.current.py) / scale;
      const handle = isResizing.current;
      let { ix, iy, iw, ih } = resizeStart.current;

      let newX = ix;
      let newY = iy;
      let newW = iw;
      let newH = ih;

      if (handle.includes("e")) newW = Math.max(MIN_SIZE, iw + dx);
      if (handle.includes("s")) newH = Math.max(MIN_SIZE, ih + dy);
      if (handle.includes("w")) {
        const delta = Math.min(dx, iw - MIN_SIZE);
        newX = ix + delta;
        newW = iw - delta;
      }
      if (handle.includes("n")) {
        const delta = Math.min(dy, ih - MIN_SIZE);
        newY = iy + delta;
        newH = ih - delta;
      }

      onResizeOptimistic(image._id, newX, newY, newW, newH);
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (isDragging.current) {
      isDragging.current = false;
      void onCommitMove(image._id, image.x, image.y);
    }
    if (isResizing.current) {
      isResizing.current = null;
      void onCommitResize(image._id, image.x, image.y, image.w, image.h);
    }
    void e;
  }

  function handleResizePointerDown(
    handle: ResizeHandle,
    e: React.PointerEvent<HTMLDivElement>
  ) {
    e.stopPropagation();
    e.preventDefault();
    isResizing.current = handle;
    resizeStart.current = {
      px: e.clientX,
      py: e.clientY,
      ix: image.x,
      iy: image.y,
      iw: image.w,
      ih: image.h,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  const handles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  function handlePosition(h: ResizeHandle): React.CSSProperties {
    const pos: React.CSSProperties = {
      position: "absolute",
      width: 10,
      height: 10,
      background: "white",
      border: "1.5px solid #3b82f6",
      borderRadius: 2,
      cursor: HANDLE_CURSORS[h],
      zIndex: 1,
    };
    if (h.includes("n")) pos.top = -5;
    if (h.includes("s")) pos.bottom = -5;
    if (!h.includes("n") && !h.includes("s")) {
      pos.top = "50%";
      pos.transform = "translateY(-50%)";
    }
    if (h.includes("w")) pos.left = -5;
    if (h.includes("e")) pos.right = -5;
    if (!h.includes("w") && !h.includes("e")) {
      pos.left = "50%";
      pos.transform = h.includes("n") || h.includes("s")
        ? "translateX(-50%)"
        : "translate(-50%, -50%)";
    }
    return pos;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            style={{
              position: "absolute",
              left: image.x,
              top: image.y,
              width: image.w,
              height: image.h,
              zIndex: image.zIndex,
              outline: selected ? "2px solid #3b82f6" : "none",
              outlineOffset: 1,
              cursor: selected ? "move" : "pointer",
              userSelect: "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(true);
            }}
          >
            {imgError || !signedUrl ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "hsl(var(--muted))",
                  color: "hsl(var(--muted-foreground))",
                  gap: 8,
                  fontSize: 12,
                  padding: 8,
                  boxSizing: "border-box",
                  textAlign: "center",
                }}
              >
                <ImageOff size={24} />
                <span className="truncate w-full">{image.filename}</span>
              </div>
            ) : (
              <img
                src={signedUrl}
                alt={image.filename}
                draggable={false}
                onError={() => setImgError(true)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "fill",
                  display: "block",
                  pointerEvents: "none",
                }}
              />
            )}

            {selected &&
              handles.map((h) => (
                <div
                  key={h}
                  style={handlePosition(h)}
                  onPointerDown={(e) => handleResizePointerDown(h, e)}
                />
              ))}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={onBringToFront}>Bring to Front</ContextMenuItem>
          <ContextMenuItem onClick={onSendToBack}>Send to Back</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete image?</AlertDialogTitle>
            <AlertDialogDescription>
              "{image.filename}" will be permanently removed from the canvas and
              storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void onDelete({ id: image._id });
                onDeselect();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 flex items-center justify-center bg-black/90">
          <VisuallyHidden>
            <DialogTitle>{image.filename}</DialogTitle>
            <DialogDescription>Full-size preview of {image.filename}</DialogDescription>
          </VisuallyHidden>
          {signedUrl && (
            <img
              src={signedUrl}
              alt={image.filename}
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                objectFit: "contain",
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
