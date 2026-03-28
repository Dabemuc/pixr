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

  // Touch: pinch-to-zoom (two fingers) + cancel pointer pan when second finger lands
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Map from touch identifier → last known position
    const pts = new Map<number, { x: number; y: number }>();

    function onTouchStart(e: TouchEvent) {
      for (const t of Array.from(e.changedTouches)) {
        pts.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      // Second finger landed — stop any pointer-event-based pan so it doesn't fight
      if (pts.size >= 2) isPanning.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length < 2) {
        // Single finger: update tracking; pointer events handle the actual pan
        for (const t of Array.from(e.changedTouches)) {
          pts.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
        return;
      }
      if (!el) return;
      e.preventDefault(); // block browser native pinch-zoom

      const [t1, t2] = Array.from(e.touches);
      const p1 = pts.get(t1.identifier) ?? { x: t1.clientX, y: t1.clientY };
      const p2 = pts.get(t2.identifier) ?? { x: t2.clientX, y: t2.clientY };

      const prevDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const currDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const factor = prevDist > 0 ? currDist / prevDist : 1;

      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const prevMidX = (p1.x + p2.x) / 2;
      const prevMidY = (p1.y + p2.y) / 2;

      const rect = el.getBoundingClientRect();
      const cx = midX - rect.left;
      const cy = midY - rect.top;

      setViewport((v) => {
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        // Zoom around pinch midpoint + pan by midpoint translation
        const newX = cx - (cx - v.x) * (newScale / v.scale) + (midX - prevMidX);
        const newY = cy - (cy - v.y) * (newScale / v.scale) + (midY - prevMidY);
        return { x: newX, y: newY, scale: newScale };
      });

      pts.set(t1.identifier, { x: t1.clientX, y: t1.clientY });
      pts.set(t2.identifier, { x: t2.clientX, y: t2.clientY });
    }

    function onTouchEnd(e: TouchEvent) {
      for (const t of Array.from(e.changedTouches)) pts.delete(t.identifier);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
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

  const fitViewport = useCallback((
    contentX: number, contentY: number, contentW: number, contentH: number,
    padding = 40
  ) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewW = rect.width - padding * 2;
    const viewH = rect.height - padding * 2;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(viewW / contentW, viewH / contentH)));
    const x = (rect.width - contentW * scale) / 2 - contentX * scale;
    const y = (rect.height - contentH * scale) / 2 - contentY * scale;
    setViewport({ x, y, scale });
  }, [containerRef]);

  return {
    viewport,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    startPan,
    resetViewport,
    zoomIn,
    zoomOut,
    fitViewport,
  };
}
