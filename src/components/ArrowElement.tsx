import { useRef } from "react";
import type { Id } from "../../convex/_generated/dataModel";

export interface ArrowShape {
  _id: Id<"shapes">;
  x: number;
  y: number;
  x2: number;
  y2: number;
  zIndex: number;
}

interface ArrowElementProps {
  shape: ArrowShape;
  selected: boolean;
  isGrouped?: boolean;
  scale: number;
  onSelect: (addToSelection?: boolean) => void;
  onMoveOptimistic: (id: string, x: number, y: number, x2: number, y2: number) => void;
  onCommitMove: (id: Id<"shapes">, x: number, y: number, x2: number, y2: number) => Promise<void>;
}

export default function ArrowElement({
  shape,
  selected,
  isGrouped = false,
  scale,
  onSelect,
  onMoveOptimistic,
  onCommitMove,
}: ArrowElementProps) {
  const isDragging = useRef<"body" | "start" | "end" | null>(null);
  const dragStart = useRef({ px: 0, py: 0, sx: 0, sy: 0, ex: 0, ey: 0 });

  const strokeColor = selected ? "#3b82f6" : "#64748b";
  const markerId = `arrow-head-${shape._id}`;
  const handleR = 6 / scale; // keep handles easy to tap at any zoom

  // Give the SVG real dimensions covering the arrow bounding box so the browser
  // actually paints the content (0x0 + overflow:visible is unreliable).
  const PAD = 20;
  const svgLeft = Math.min(shape.x, shape.x2) - PAD;
  const svgTop = Math.min(shape.y, shape.y2) - PAD;
  const svgWidth = Math.abs(shape.x2 - shape.x) + PAD * 2;
  const svgHeight = Math.abs(shape.y2 - shape.y) + PAD * 2;

  function startDrag(
    type: "body" | "start" | "end",
    e: React.PointerEvent,
    captureTarget: Element
  ) {
    e.stopPropagation();
    if (e.button !== 0) return;
    isDragging.current = type;
    dragStart.current = {
      px: e.clientX,
      py: e.clientY,
      sx: shape.x,
      sy: shape.y,
      ex: shape.x2,
      ey: shape.y2,
    };
    (captureTarget as Element & { setPointerCapture: (id: number) => void }).setPointerCapture(
      e.pointerId
    );
  }

  function handleSvgPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!isDragging.current) return;
    const dx = (e.clientX - dragStart.current.px) / scale;
    const dy = (e.clientY - dragStart.current.py) / scale;
    const { sx, sy, ex, ey } = dragStart.current;
    if (isDragging.current === "body") {
      onMoveOptimistic(shape._id, sx + dx, sy + dy, ex + dx, ey + dy);
    } else if (isDragging.current === "start") {
      onMoveOptimistic(shape._id, sx + dx, sy + dy, ex, ey);
    } else {
      onMoveOptimistic(shape._id, sx, sy, ex + dx, ey + dy);
    }
  }

  function handleSvgPointerUp() {
    if (!isDragging.current) return;
    isDragging.current = null;
    void onCommitMove(shape._id, shape.x, shape.y, shape.x2, shape.y2);
  }

  return (
    <svg
      viewBox={`${svgLeft} ${svgTop} ${svgWidth} ${svgHeight}`}
      style={{
        position: "absolute",
        left: svgLeft,
        top: svgTop,
        width: svgWidth,
        height: svgHeight,
        overflow: "visible",
        zIndex: shape.zIndex,
      }}
      onPointerMove={handleSvgPointerMove}
      onPointerUp={handleSvgPointerUp}
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill={strokeColor} />
        </marker>
      </defs>

      {/* Invisible thick hit area for body drag */}
      <line
        x1={shape.x}
        y1={shape.y}
        x2={shape.x2}
        y2={shape.y2}
        stroke="transparent"
        strokeWidth={12}
        style={{ pointerEvents: "stroke", cursor: selected ? "move" : "pointer" }}
        onPointerDown={(e) => {
          if (!selected) {
            e.stopPropagation();
            onSelect(e.shiftKey);
            return;
          }
          if (isGrouped) { e.stopPropagation(); return; }
          startDrag("body", e, e.currentTarget);
        }}
      />

      {/* Visible arrow line */}
      <line
        x1={shape.x}
        y1={shape.y}
        x2={shape.x2}
        y2={shape.y2}
        stroke={strokeColor}
        strokeWidth={2}
        markerEnd={`url(#${markerId})`}
        style={{ pointerEvents: "none" }}
      />

      {/* Endpoint handles when selected */}
      {selected && !isGrouped && (
        <>
          <circle
            cx={shape.x}
            cy={shape.y}
            r={handleR}
            fill="white"
            stroke="#3b82f6"
            strokeWidth={1.5 / scale}
            style={{ pointerEvents: "all", cursor: "crosshair" }}
            onPointerDown={(e) => startDrag("start", e, e.currentTarget)}
          />
          <circle
            cx={shape.x2}
            cy={shape.y2}
            r={handleR}
            fill="white"
            stroke="#3b82f6"
            strokeWidth={1.5 / scale}
            style={{ pointerEvents: "all", cursor: "crosshair" }}
            onPointerDown={(e) => startDrag("end", e, e.currentTarget)}
          />
        </>
      )}
    </svg>
  );
}
