import { useRef, useState, useEffect } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { AlignLeft, AlignCenter, AlignRight, Heading1, SquareDashed } from "lucide-react";

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nw-resize", n: "n-resize", ne: "ne-resize", e: "e-resize",
  se: "se-resize", s: "s-resize", sw: "sw-resize", w: "w-resize",
};

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_SIZE = 50;

export type TextStyle = {
  textAlign: "left" | "center" | "right";
  isHeadline: boolean;
  showBorder: boolean;
  bgColor: string;
  textColor: string;
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  textAlign: "left",
  isHeadline: false,
  showBorder: true,
  bgColor: "",
  textColor: "",
};

export interface TextShape {
  _id: Id<"shapes">;
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  zIndex: number;
  textAlign?: "left" | "center" | "right";
  isHeadline?: boolean;
  showBorder?: boolean;
  bgColor?: string;
  textColor?: string;
}

interface TextElementProps {
  shape: TextShape;
  selected: boolean;
  isGrouped?: boolean;
  scale: number;
  onSelect: (addToSelection?: boolean) => void;
  onMoveOptimistic: (id: string, x: number, y: number) => void;
  onCommitMove: (id: Id<"shapes">, x: number, y: number, prevX: number, prevY: number) => Promise<void>;
  onResizeOptimistic: (id: string, x: number, y: number, w: number, h: number) => void;
  onCommitResize: (id: Id<"shapes">, x: number, y: number, w: number, h: number, prevX: number, prevY: number, prevW: number, prevH: number) => Promise<void>;
  onContentChange: (id: Id<"shapes">, content: string) => void;
  onStyleChange: (id: Id<"shapes">, style: TextStyle, prevStyle?: TextStyle) => void;
  onDelete: (id: Id<"shapes">) => void;
}

export default function TextElement({
  shape,
  selected,
  isGrouped = false,
  scale,
  onSelect,
  onMoveOptimistic,
  onCommitMove,
  onResizeOptimistic,
  onCommitResize,
  onContentChange,
  onStyleChange,
}: TextElementProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(shape.content ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDragging = useRef(false);
  const isResizing = useRef<ResizeHandle | null>(null);
  const dragStart = useRef({ px: 0, py: 0, ix: 0, iy: 0 });
  const resizeStart = useRef({ px: 0, py: 0, ix: 0, iy: 0, iw: 0, ih: 0 });

  // ── Style ─────────────────────────────────────────────────────────────────
  const currentStyle: TextStyle = {
    textAlign: shape.textAlign ?? DEFAULT_TEXT_STYLE.textAlign,
    isHeadline: shape.isHeadline ?? DEFAULT_TEXT_STYLE.isHeadline,
    showBorder: shape.showBorder ?? DEFAULT_TEXT_STYLE.showBorder,
    bgColor: shape.bgColor ?? DEFAULT_TEXT_STYLE.bgColor,
    textColor: shape.textColor ?? DEFAULT_TEXT_STYLE.textColor,
  };

  // Local color drafts for live preview while picker is open
  const [bgColorDraft, setBgColorDraft] = useState(currentStyle.bgColor);
  const [textColorDraft, setTextColorDraft] = useState(currentStyle.textColor);
  const bgColorBefore = useRef(currentStyle.bgColor);
  const textColorBefore = useRef(currentStyle.textColor);

  // Sync color drafts when shape changes (and picker isn't open)
  useEffect(() => { setBgColorDraft(currentStyle.bgColor); }, [shape.bgColor]);
  useEffect(() => { setTextColorDraft(currentStyle.textColor); }, [shape.textColor]);

  function getStyle(): TextStyle {
    return { ...currentStyle, bgColor: bgColorDraft, textColor: textColorDraft };
  }

  function changeStyle(patch: Partial<TextStyle>) {
    const prev = getStyle();
    const next = { ...prev, ...patch };
    onStyleChange(shape._id, next, prev);
  }

  // ── Content ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEditing) setDraft(shape.content ?? "");
  }, [shape.content, isEditing]);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [isEditing]);

  // ── Drag/resize ───────────────────────────────────────────────────────────
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (!selected) { onSelect(e.shiftKey); return; }
    if (isEditing || isGrouped) return;
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
      if (handle.includes("w")) { const d = Math.min(dx, iw - MIN_SIZE); newX = ix + d; newW = iw - d; }
      if (handle.includes("n")) { const d = Math.min(dy, ih - MIN_SIZE); newY = iy + d; newH = ih - d; }
      onResizeOptimistic(shape._id, newX, newY, newW, newH);
    }
  }

  function handlePointerUp() {
    if (isDragging.current) {
      isDragging.current = false;
      void onCommitMove(shape._id, shape.x, shape.y, dragStart.current.ix, dragStart.current.iy);
    }
    if (isResizing.current) {
      isResizing.current = null;
      void onCommitResize(
        shape._id, shape.x, shape.y, shape.w, shape.h,
        resizeStart.current.ix, resizeStart.current.iy, resizeStart.current.iw, resizeStart.current.ih
      );
    }
  }

  function handleResizePointerDown(handle: ResizeHandle, e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    isResizing.current = handle;
    resizeStart.current = { px: e.clientX, py: e.clientY, ix: shape.x, iy: shape.y, iw: shape.w, ih: shape.h };
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
      position: "absolute", width: 10, height: 10,
      background: "white", border: "1.5px solid #3b82f6", borderRadius: 2,
      cursor: HANDLE_CURSORS[h], zIndex: 1,
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

  // ── Derived style values ──────────────────────────────────────────────────
  const fontSize = currentStyle.isHeadline ? 36 : 16;
  const resolvedBg = bgColorDraft || undefined;
  const resolvedText = textColorDraft || undefined;
  const borderStyle = currentStyle.showBorder
    ? (selected ? "2px solid #3b82f6" : "1px dashed #94a3b8")
    : (selected ? "2px solid #3b82f6" : "none");

  const btnBase: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 24, height: 24, borderRadius: 4, border: "none", cursor: "pointer",
    background: "transparent", padding: 0, flexShrink: 0,
  };

  return (
    <div
      style={{
        position: "absolute", left: shape.x, top: shape.y,
        width: shape.w, height: shape.h, zIndex: shape.zIndex,
        outline: borderStyle, outlineOffset: 1, borderRadius: 4,
        cursor: selected && !isEditing ? "move" : "default",
        userSelect: "none", boxSizing: "border-box",
        background: resolvedBg ?? "hsl(var(--background) / 0.6)",
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
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); commitEdit(); } }}
          style={{
            width: "100%", height: "100%", border: "none", outline: "none",
            resize: "none", padding: 8,
            background: "transparent", fontSize, fontFamily: "inherit",
            color: resolvedText ?? "hsl(var(--foreground))",
            textAlign: currentStyle.textAlign,
            cursor: "text", boxSizing: "border-box",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          style={{
            width: "100%", height: "100%", padding: 8, fontSize,
            fontFamily: "inherit", color: resolvedText ?? "hsl(var(--foreground))",
            textAlign: currentStyle.textAlign,
            fontWeight: currentStyle.isHeadline ? 700 : undefined,
            whiteSpace: "pre-wrap", overflowWrap: "break-word",
            overflow: "hidden", boxSizing: "border-box",
          }}
        >
          {shape.content || (
            <span style={{ color: "hsl(var(--muted-foreground))", opacity: 0.5 }}>
              Double-click to edit…
            </span>
          )}
        </div>
      )}

      {selected && !isGrouped &&
        HANDLES.map((h) => (
          <div key={h} style={handlePosition(h)} onPointerDown={(e) => handleResizePointerDown(h, e)} />
        ))}

      {/* ── Floating style panel ────────────────────────────────────────── */}
      {selected && !isGrouped && (
        <div
          style={{
            position: "absolute", left: shape.w + 8, top: 0,
            width: 30, display: "flex", flexDirection: "column",
            alignItems: "center", gap: 2, padding: "6px 3px",
            background: "hsl(var(--background))", border: "1px solid hsl(var(--border))",
            borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            pointerEvents: "all",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Text alignment */}
          {(["left", "center", "right"] as const).map((a) => {
            const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
            const active = currentStyle.textAlign === a;
            return (
              <button
                key={a}
                title={`Align ${a}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => changeStyle({ textAlign: a })}
                style={{
                  ...btnBase,
                  background: active ? "hsl(var(--accent))" : "transparent",
                  color: active ? "hsl(var(--accent-foreground))" : "hsl(var(--muted-foreground))",
                }}
              >
                <Icon size={13} />
              </button>
            );
          })}

          <div style={{ width: "80%", height: 1, background: "hsl(var(--border))", margin: "2px 0" }} />

          {/* Headline toggle */}
          <button
            title="Headline"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => changeStyle({ isHeadline: !currentStyle.isHeadline })}
            style={{
              ...btnBase,
              background: currentStyle.isHeadline ? "hsl(var(--accent))" : "transparent",
              color: currentStyle.isHeadline ? "hsl(var(--accent-foreground))" : "hsl(var(--muted-foreground))",
            }}
          >
            <Heading1 size={13} />
          </button>

          {/* Border toggle */}
          <button
            title="Toggle border"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => changeStyle({ showBorder: !currentStyle.showBorder })}
            style={{
              ...btnBase,
              background: currentStyle.showBorder ? "hsl(var(--accent))" : "transparent",
              color: currentStyle.showBorder ? "hsl(var(--accent-foreground))" : "hsl(var(--muted-foreground))",
            }}
          >
            <SquareDashed size={13} />
          </button>

          <div style={{ width: "80%", height: 1, background: "hsl(var(--border))", margin: "2px 0" }} />

          {/* Background color */}
          <label
            title="Background color"
            style={{ position: "relative", width: 20, height: 20, cursor: "pointer", flexShrink: 0 }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 4,
              border: "1.5px solid hsl(var(--border))",
              background: bgColorDraft || "transparent",
              backgroundImage: bgColorDraft ? undefined :
                "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
              backgroundSize: bgColorDraft ? undefined : "6px 6px",
              backgroundPosition: bgColorDraft ? undefined : "0 0, 0 3px, 3px -3px, -3px 0",
            }} />
            <input
              type="color"
              value={bgColorDraft || "#ffffff"}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
              onFocus={() => { bgColorBefore.current = bgColorDraft; }}
              onChange={(e) => {
                setBgColorDraft(e.target.value);
                // Fire mutation for live preview (no history)
                onStyleChange(shape._id, { ...getStyle(), bgColor: e.target.value });
              }}
              onBlur={(e) => {
                const newColor = e.target.value;
                if (newColor !== bgColorBefore.current) {
                  onStyleChange(
                    shape._id,
                    { ...getStyle(), bgColor: newColor },
                    { ...getStyle(), bgColor: bgColorBefore.current }
                  );
                }
              }}
            />
          </label>

          {/* Text color */}
          <label
            title="Text color"
            style={{ position: "relative", width: 20, height: 20, cursor: "pointer", flexShrink: 0 }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 4,
              border: "1.5px solid hsl(var(--border))",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "hsl(var(--background))",
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, lineHeight: 1,
                color: textColorDraft || "hsl(var(--foreground))",
                borderBottom: `2px solid ${textColorDraft || "hsl(var(--foreground))"}`,
              }}>A</span>
            </div>
            <input
              type="color"
              value={textColorDraft || "#000000"}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }}
              onFocus={() => { textColorBefore.current = textColorDraft; }}
              onChange={(e) => {
                setTextColorDraft(e.target.value);
                onStyleChange(shape._id, { ...getStyle(), textColor: e.target.value });
              }}
              onBlur={(e) => {
                const newColor = e.target.value;
                if (newColor !== textColorBefore.current) {
                  onStyleChange(
                    shape._id,
                    { ...getStyle(), textColor: newColor },
                    { ...getStyle(), textColor: textColorBefore.current }
                  );
                }
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
