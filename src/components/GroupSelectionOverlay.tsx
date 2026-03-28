import { useRef } from "react";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const CURSORS: Record<ResizeHandle, string> = {
  nw: "nw-resize", n: "n-resize", ne: "ne-resize",
  e: "e-resize", se: "se-resize", s: "s-resize",
  sw: "sw-resize", w: "w-resize",
};

export interface Bounds { x: number; y: number; w: number; h: number; }

interface Props {
  bounds: Bounds;
  scale: number;
  onDragStart: (startClientX: number, startClientY: number) => void;
  onDragMove: (clientX: number, clientY: number) => void;
  onDragEnd: () => void;
  onResizeStart: (handle: ResizeHandle, startClientX: number, startClientY: number) => void;
  onResizeMove: (clientX: number, clientY: number) => void;
  onResizeEnd: () => void;
}

export default function GroupSelectionOverlay({
  bounds, scale,
  onDragStart, onDragMove, onDragEnd,
  onResizeStart, onResizeMove, onResizeEnd,
}: Props) {
  // "none" | "drag" | ResizeHandle
  const interaction = useRef<"none" | "drag" | ResizeHandle>("none");
  // Resize handle sets this before bubbling to the outer div's onPointerDown
  const pendingHandle = useRef<ResizeHandle | null>(null);

  const PAD = 6 / scale;
  const BORDER = 1.5 / scale;
  const HS = 10 / scale; // handle size
  const { x, y, w, h } = bounds;

  function getHandleStyle(handle: ResizeHandle): React.CSSProperties {
    const half = HS / 2;
    const base: React.CSSProperties = {
      position: "absolute",
      width: HS,
      height: HS,
      background: "white",
      border: `${1.5 / scale}px solid #3b82f6`,
      borderRadius: 2 / scale,
      boxSizing: "border-box",
      cursor: CURSORS[handle],
      zIndex: 1,
    };
    if (handle.includes("n")) base.top = -half;
    if (handle.includes("s")) base.bottom = -half;
    if (!handle.includes("n") && !handle.includes("s")) {
      base.top = "50%";
      base.transform = "translateY(-50%)";
    }
    if (handle.includes("w")) base.left = -half;
    if (handle.includes("e")) base.right = -half;
    if (!handle.includes("w") && !handle.includes("e")) {
      base.left = "50%";
      base.transform =
        base.transform === "translateY(-50%)"
          ? "translate(-50%, -50%)"
          : "translateX(-50%)";
    }
    return base;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: x - PAD,
        top: y - PAD,
        width: w + PAD * 2,
        height: h + PAD * 2,
        border: `${BORDER}px dashed #3b82f6`,
        borderRadius: 2 / scale,
        boxSizing: "border-box",
        cursor: "grab",
        zIndex: 10000,
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const handle = pendingHandle.current;
        pendingHandle.current = null;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (handle) {
          interaction.current = handle;
          onResizeStart(handle, e.clientX, e.clientY);
        } else {
          interaction.current = "drag";
          onDragStart(e.clientX, e.clientY);
        }
      }}
      onPointerMove={(e) => {
        if (interaction.current === "drag") onDragMove(e.clientX, e.clientY);
        else if (interaction.current !== "none") onResizeMove(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        if (interaction.current === "drag") onDragEnd();
        else if (interaction.current !== "none") onResizeEnd();
        interaction.current = "none";
      }}
    >
      {HANDLES.map((handle) => (
        <div
          key={handle}
          style={getHandleStyle(handle)}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            // Set before parent onPointerDown fires via event bubbling
            pendingHandle.current = handle;
          }}
        />
      ))}
    </div>
  );
}
