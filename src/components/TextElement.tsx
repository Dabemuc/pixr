import { useRef, useState, useEffect } from "react";
import type { Id } from "../../convex/_generated/dataModel";

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

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_SIZE = 50;

export interface TextShape {
  _id: Id<"shapes">;
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  zIndex: number;
}

interface TextElementProps {
  shape: TextShape;
  selected: boolean;
  scale: number;
  onSelect: () => void;
  onMoveOptimistic: (id: string, x: number, y: number) => void;
  onCommitMove: (id: Id<"shapes">, x: number, y: number) => Promise<void>;
  onResizeOptimistic: (id: string, x: number, y: number, w: number, h: number) => void;
  onCommitResize: (id: Id<"shapes">, x: number, y: number, w: number, h: number) => Promise<void>;
  onContentChange: (id: Id<"shapes">, content: string) => void;
  onDelete: (id: Id<"shapes">) => void;
}

export default function TextElement({
  shape,
  selected,
  scale,
  onSelect,
  onMoveOptimistic,
  onCommitMove,
  onResizeOptimistic,
  onCommitResize,
  onContentChange,
}: TextElementProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(shape.content ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDragging = useRef(false);
  const isResizing = useRef<ResizeHandle | null>(null);
  const dragStart = useRef({ px: 0, py: 0, ix: 0, iy: 0 });
  const resizeStart = useRef({ px: 0, py: 0, ix: 0, iy: 0, iw: 0, ih: 0 });

  useEffect(() => {
    if (!isEditing) setDraft(shape.content ?? "");
  }, [shape.content, isEditing]);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [isEditing]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (!selected) {
      onSelect();
      return;
    }
    if (isEditing) return;
    isDragging.current = true;
    dragStart.current = { px: e.clientX, py: e.clientY, ix: shape.x, iy: shape.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (isDragging.current) {
      const dx = (e.clientX - dragStart.current.px) / scale;
      const dy = (e.clientY - dragStart.current.py) / scale;
      onMoveOptimistic(shape._id, dragStart.current.ix + dx, dragStart.current.iy + dy);
    }
    if (isResizing.current) {
      const dx = (e.clientX - resizeStart.current.px) / scale;
      const dy = (e.clientY - resizeStart.current.py) / scale;
      const handle = isResizing.current;
      const { ix, iy, iw, ih } = resizeStart.current;
      let newX = ix, newY = iy, newW = iw, newH = ih;
      if (handle.includes("e")) newW = Math.max(MIN_SIZE, iw + dx);
      if (handle.includes("s")) newH = Math.max(MIN_SIZE, ih + dy);
      if (handle.includes("w")) {
        const d = Math.min(dx, iw - MIN_SIZE);
        newX = ix + d;
        newW = iw - d;
      }
      if (handle.includes("n")) {
        const d = Math.min(dy, ih - MIN_SIZE);
        newY = iy + d;
        newH = ih - d;
      }
      onResizeOptimistic(shape._id, newX, newY, newW, newH);
    }
  }

  function handlePointerUp() {
    if (isDragging.current) {
      isDragging.current = false;
      void onCommitMove(shape._id, shape.x, shape.y);
    }
    if (isResizing.current) {
      isResizing.current = null;
      void onCommitResize(shape._id, shape.x, shape.y, shape.w, shape.h);
    }
  }

  function handleResizePointerDown(handle: ResizeHandle, e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    isResizing.current = handle;
    resizeStart.current = {
      px: e.clientX,
      py: e.clientY,
      ix: shape.x,
      iy: shape.y,
      iw: shape.w,
      ih: shape.h,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setIsEditing(true);
    setDraft(shape.content ?? "");
  }

  function commitEdit() {
    setIsEditing(false);
    onContentChange(shape._id, draft);
  }

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
      pos.transform =
        h.includes("n") || h.includes("s")
          ? "translateX(-50%)"
          : "translate(-50%, -50%)";
    }
    return pos;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: shape.x,
        top: shape.y,
        width: shape.w,
        height: shape.h,
        zIndex: shape.zIndex,
        outline: selected ? "2px solid #3b82f6" : "1px dashed #94a3b8",
        outlineOffset: 1,
        borderRadius: 4,
        cursor: selected && !isEditing ? "move" : "default",
        userSelect: "none",
        boxSizing: "border-box",
        background: "hsl(var(--background) / 0.6)",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              commitEdit();
            }
          }}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            outline: "none",
            resize: "none",
            padding: 8,
            background: "transparent",
            fontSize: 14,
            fontFamily: "inherit",
            color: "hsl(var(--foreground))",
            cursor: "text",
            boxSizing: "border-box",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            padding: 8,
            fontSize: 14,
            fontFamily: "inherit",
            color: "hsl(var(--foreground))",
            whiteSpace: "pre-wrap",
            overflowWrap: "break-word",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          {shape.content || (
            <span style={{ color: "hsl(var(--muted-foreground))", opacity: 0.5 }}>
              Double-click to edit…
            </span>
          )}
        </div>
      )}

      {selected &&
        HANDLES.map((h) => (
          <div
            key={h}
            style={handlePosition(h)}
            onPointerDown={(e) => handleResizePointerDown(h, e)}
          />
        ))}
    </div>
  );
}
