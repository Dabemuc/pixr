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
  scale: number;
  onSelect: () => void;
  onMoveOptimistic: (id: string, x: number, y: number, x2: number, y2: number) => void;
  onCommitMove: (id: Id<"shapes">, x: number, y: number, x2: number, y2: number) => Promise<void>;
}

export default function ArrowElement({
  shape,
  selected,
  scale,
  onSelect,
  onMoveOptimistic,
  onCommitMove,
}: ArrowElementProps) {
  const isDragging = useRef<"body" | "start" | "end" | null>(null);
  const dragStart = useRef({ px: 0, py: 0, sx: 0, sy: 0, ex: 0, ey: 0 });

  const strokeColor = selected ? "#3b82f6" : "#64748b";
  const markerId = `arrow-head-${shape._id}`;
  const handleR = 6 / scale;

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
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
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
        strokeWidth={12 / scale}
        style={{ pointerEvents: "stroke", cursor: selected ? "move" : "pointer" }}
        onPointerDown={(e) => {
          if (!selected) {
            e.stopPropagation();
            onSelect();
            return;
          }
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
        strokeWidth={2 / scale}
        markerEnd={`url(#${markerId})`}
        style={{ pointerEvents: "none" }}
      />

      {/* Endpoint handles when selected */}
      {selected && (
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
