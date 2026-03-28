import { useEffect, useRef, useState, useCallback } from "react";
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
import { ImageOff, AlignLeft, AlignCenter } from "lucide-react";

type DescriptionAlign = "left" | "center";

interface ImageData {
  _id: Id<"images">;
  storageKey: string;
  filename: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  description?: string;
  descriptionAlign?: DescriptionAlign;
}

interface CanvasImageProps {
  image: ImageData;
  selected: boolean;
  isGrouped?: boolean;
  scale: number;
  onSelect: (addToSelection?: boolean) => void;
  onDeselect: () => void;
  onMoveOptimistic: (id: string, x: number, y: number) => void;
  onCommitMove: (id: Id<"images">, x: number, y: number, prevX: number, prevY: number) => Promise<void>;
  onCommitResize: (
    id: Id<"images">,
    x: number,
    y: number,
    w: number,
    h: number,
    prevX: number,
    prevY: number,
    prevW: number,
    prevH: number
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
  onDescriptionChange: (description: string) => void;
  onDescriptionAlignChange: (align: DescriptionAlign) => void;
  onCopy: () => void;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

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
  isGrouped = false,
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
  onDescriptionChange,
  onDescriptionAlignChange,
  onCopy,
}: CanvasImageProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // ── Description state ────────────────────────────────────────────────────
  const [descriptionDraft, setDescriptionDraft] = useState(image.description ?? "");
  const [align, setAlign] = useState<DescriptionAlign>(image.descriptionAlign ?? "center");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [focusPending, setFocusPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEditingRef = useRef(false); // ref copy for use in effects/callbacks

  // Sync draft from server when not editing
  useEffect(() => {
    if (!isEditingRef.current) {
      setDescriptionDraft(image.description ?? "");
    }
  }, [image.description]);

  useEffect(() => {
    if (!isEditingRef.current) {
      setAlign(image.descriptionAlign ?? "center");
    }
  }, [image.descriptionAlign]);

  // Focus textarea when focusPending becomes true
  useEffect(() => {
    if (!focusPending) return;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
    setFocusPending(false);
  }, [focusPending]);

  // Auto-resize textarea height to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [descriptionDraft, isEditingDescription]);

  // When selected and no input is focused, typing starts the description
  useEffect(() => {
    if (!selected) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      // If a description already exists, require a deliberate click to edit
      if (descriptionDraft !== "") return;
      // Prevent the character from being re-inserted into the textarea once it's focused
      e.preventDefault();
      setDescriptionDraft(e.key);
      setFocusPending(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, descriptionDraft]);

  const handleDescriptionBlur = useCallback(() => {
    isEditingRef.current = false;
    setIsEditingDescription(false);
    const trimmed = descriptionDraft.trim();
    setDescriptionDraft(trimmed);
    if (trimmed !== (image.description ?? "")) {
      onDescriptionChange(trimmed);
    }
  }, [descriptionDraft, image.description, onDescriptionChange]);

  function handleAlignChange(newAlign: DescriptionAlign) {
    setAlign(newAlign);
    onDescriptionAlignChange(newAlign);
  }

  const showDescription = selected || descriptionDraft !== "";

  // ── Image load ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    requestImageUrl(image.storageKey)
      .then((url) => { if (!cancelled) setSignedUrl(url); })
      .catch(() => { if (!cancelled) setImgError(true); });
    return () => { cancelled = true; };
  }, [image.storageKey]);

  // ── Drag/resize refs ─────────────────────────────────────────────────────
  const isDragging = useRef(false);
  const isResizing = useRef<ResizeHandle | null>(null);
  const dragStart = useRef({ px: 0, py: 0, ix: 0, iy: 0 });
  const resizeStart = useRef({ px: 0, py: 0, ix: 0, iy: 0, iw: 0, ih: 0 });

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (!selected) {
      onSelect(e.shiftKey);
      return;
    }
    if (isGrouped) return;
    isDragging.current = true;
    dragStart.current = { px: e.clientX, py: e.clientY, ix: image.x, iy: image.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current && !isResizing.current) return;
    if (isDragging.current) {
      const dx = (e.clientX - dragStart.current.px) / scale;
      const dy = (e.clientY - dragStart.current.py) / scale;
      onMoveOptimistic(image._id, dragStart.current.ix + dx, dragStart.current.iy + dy);
    }
    if (isResizing.current) {
      const dx = (e.clientX - resizeStart.current.px) / scale;
      const dy = (e.clientY - resizeStart.current.py) / scale;
      const handle = isResizing.current;
      const { ix, iy, iw, ih } = resizeStart.current;
      const aspect = iw / ih;
      let newX = ix, newY = iy, newW = iw, newH = ih;
      if (handle.includes("e")) newW = Math.max(MIN_SIZE, iw + dx);
      if (handle.includes("s")) newH = Math.max(MIN_SIZE, ih + dy);
      if (handle.includes("w")) { const d = Math.min(dx, iw - MIN_SIZE); newX = ix + d; newW = iw - d; }
      if (handle.includes("n")) { const d = Math.min(dy, ih - MIN_SIZE); newY = iy + d; newH = ih - d; }
      if (e.shiftKey) {
        if (handle === "e" || handle === "w") { newH = Math.max(MIN_SIZE, newW / aspect); if (handle === "w") newX = ix + iw - newW; }
        else if (handle === "n" || handle === "s") { newW = Math.max(MIN_SIZE, newH * aspect); if (handle === "n") newY = iy + ih - newH; }
        else {
          const wByDx = Math.max(MIN_SIZE, handle.includes("e") ? iw + dx : iw - dx);
          const hByDy = Math.max(MIN_SIZE, handle.includes("s") ? ih + dy : ih - dy);
          if (Math.abs(dx) >= Math.abs(dy)) { newW = wByDx; newH = newW / aspect; }
          else { newH = hByDy; newW = newH * aspect; }
          if (handle.includes("w")) newX = ix + iw - newW;
          if (handle.includes("n")) newY = iy + ih - newH;
        }
      }
      onResizeOptimistic(image._id, newX, newY, newW, newH);
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (isDragging.current) {
      isDragging.current = false;
      void onCommitMove(image._id, image.x, image.y, dragStart.current.ix, dragStart.current.iy);
    }
    if (isResizing.current) {
      isResizing.current = null;
      void onCommitResize(
        image._id, image.x, image.y, image.w, image.h,
        resizeStart.current.ix, resizeStart.current.iy, resizeStart.current.iw, resizeStart.current.ih
      );
    }
    void e;
  }

  function handleResizePointerDown(handle: ResizeHandle, e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    isResizing.current = handle;
    resizeStart.current = { px: e.clientX, py: e.clientY, ix: image.x, iy: image.y, iw: image.w, ih: image.h };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  const handles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

  function handlePosition(h: ResizeHandle): React.CSSProperties {
    const pos: React.CSSProperties = {
      position: "absolute",
      width: 10, height: 10,
      background: "white",
      border: "1.5px solid #3b82f6",
      borderRadius: 2,
      cursor: HANDLE_CURSORS[h],
      zIndex: 1,
    };
    if (h.includes("n")) pos.top = -5;
    if (h.includes("s")) pos.bottom = -5;
    if (!h.includes("n") && !h.includes("s")) { pos.top = "50%"; pos.transform = "translateY(-50%)"; }
    if (h.includes("w")) pos.left = -5;
    if (h.includes("e")) pos.right = -5;
    if (!h.includes("w") && !h.includes("e")) {
      pos.left = "50%";
      pos.transform = h.includes("n") || h.includes("s") ? "translateX(-50%)" : "translate(-50%, -50%)";
    }
    return pos;
  }

  return (
    <>
      {/*
        Outer wrapper: absolutely positioned, holds both image and description.
        The selection outline wraps the entire widget (image + description).
      */}
      <div
        style={{
          position: "absolute",
          left: image.x,
          top: image.y,
          width: image.w,
          zIndex: image.zIndex,
          outline: selected ? "2px solid #3b82f6" : "none",
          outlineOffset: 1,
          borderRadius: showDescription ? "0 0 6px 6px" : 0,
          boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
        }}
      >
        {/* Image area */}
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              style={{
                position: "relative",
                width: image.w,
                height: image.h,
                cursor: selected ? "move" : "pointer",
                userSelect: "none",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onDoubleClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
            >
              {imgError || !signedUrl ? (
                <div style={{
                  width: "100%", height: "100%",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))",
                  gap: 8, fontSize: 12, padding: 8, boxSizing: "border-box", textAlign: "center",
                }}>
                  <ImageOff size={24} />
                  <span className="truncate w-full">{image.filename}</span>
                </div>
              ) : (
                <img
                  src={signedUrl}
                  alt={image.filename}
                  draggable={false}
                  onError={() => setImgError(true)}
                  style={{ width: "100%", height: "100%", objectFit: "fill", display: "block", pointerEvents: "none" }}
                />
              )}

              {selected && !isGrouped && handles.map((h) => (
                <div key={h} style={handlePosition(h)} onPointerDown={(e) => handleResizePointerDown(h, e)} />
              ))}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={onCopy}>Copy</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onBringToFront}>Bring to Front</ContextMenuItem>
            <ContextMenuItem onClick={onSendToBack}>Send to Back</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem className="text-destructive" onClick={() => setDeleteDialogOpen(true)}>
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {/* Description box — attached directly below image, rounded only at bottom */}
        {showDescription && (
          <div
            style={{ position: "relative" }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              ref={textareaRef}
              value={descriptionDraft}
              placeholder="Add a description…"
              rows={1}
              style={{
                textAlign: align,
                overflow: "hidden",
                display: "block",
                minHeight: 28,
                fontSize: 32,
                background: "hsl(var(--muted))",
                borderTop: "1px solid hsl(var(--border))",
                borderRadius: "0 0 6px 6px",
              }}
              className="w-full resize-none px-2 py-1.5 text-card-foreground placeholder:text-muted-foreground/40 outline-none leading-snug"
              onChange={(e) => setDescriptionDraft(e.target.value)}
              onFocus={() => {
                isEditingRef.current = true;
                setIsEditingDescription(true);
              }}
              onBlur={handleDescriptionBlur}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setDescriptionDraft(image.description ?? "");
                  e.currentTarget.blur();
                }
                e.stopPropagation();
              }}
            />

            {/* Single floating alignment toggle — visible while editing */}
            {isEditingDescription && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleAlignChange(align === "center" ? "left" : "center")}
                style={{ position: "absolute", right: -28, top: "50%", transform: "translateY(-50%)" }}
                className="flex items-center justify-center w-6 h-6 rounded-full bg-muted border border-border shadow-md text-muted-foreground hover:text-foreground transition-colors"
              >
                {align === "center" ? <AlignCenter className="h-3 w-3" /> : <AlignLeft className="h-3 w-3" />}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete image?</AlertDialogTitle>
            <AlertDialogDescription>
              "{image.filename}" will be permanently removed from the canvas and storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { void onDelete({ id: image._id }); onDeselect(); }}
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
            <img src={signedUrl} alt={image.filename} style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain" }} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
