import { useCallback, useEffect, useRef, useState } from "react";

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;

export function useCanvas(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // Wheel: Ctrl/pinch = zoom, plain scroll = pan (trackpad two-finger)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setViewport((v) => {
          const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
          const newX = cx - (cx - v.x) * (newScale / v.scale);
          const newY = cy - (cy - v.y) * (newScale / v.scale);
          return { x: newX, y: newY, scale: newScale };
        });
      } else {
        setViewport((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [containerRef]);

  // Middle-mouse-button pan
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 1) return;
    isPanning.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  // Explicit pan start — call this for left-drag pan (select tool)
  const startPan = useCallback((clientX: number, clientY: number) => {
    isPanning.current = true;
    lastPointer.current = { x: clientX, y: clientY };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }, []);

  const onPointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const resetViewport = useCallback(() => {
    setViewport({ x: 0, y: 0, scale: 1 });
  }, []);

  const zoomIn = useCallback(() => {
    setViewport((v) => ({ ...v, scale: Math.min(MAX_SCALE, v.scale * 1.2) }));
  }, []);

  const zoomOut = useCallback(() => {
    setViewport((v) => ({ ...v, scale: Math.max(MIN_SCALE, v.scale / 1.2) }));
  }, []);

  return {
    viewport,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    startPan,
    resetViewport,
    zoomIn,
    zoomOut,
  };
}
