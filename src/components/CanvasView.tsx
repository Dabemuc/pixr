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
import GroupSelectionOverlay, {
  type Bounds,
  type ResizeHandle,
} from "@/components/GroupSelectionOverlay";
import UploadZone from "@/components/UploadZone";
import { requestUploadUrl, uploadToS3, preprocessImage, replaceExtension } from "@/lib/s3";
import { useUndoRedo, type HistoryEntry } from "@/hooks/useUndoRedo";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";

interface CanvasViewProps {
  canvasId: Id<"canvases">;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  readOnly?: boolean;
}

// ── Types for group operations ────────────────────────────────────────────────
type OrigElement =
  | { kind: "image"; x: number; y: number; w: number; h: number }
  | { kind: "text"; x: number; y: number; w: number; h: number }
  | { kind: "arrow"; x: number; y: number; x2: number; y2: number };

interface GroupOpState {
  startClientX: number;
  startClientY: number;
  origPositions: Map<string, OrigElement>;
  origBounds?: Bounds;
  handle?: ResizeHandle;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function computeSelectionBounds(
  selectedIds: Set<string>,
  images: { _id: string; x: number; y: number; w: number; h: number }[],
  shapes: { _id: string; type: string; x: number; y: number; w?: number; h?: number; x2?: number; y2?: number }[]
): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let found = false;
  for (const img of images) {
    if (!selectedIds.has(img._id)) continue;
    found = true;
    minX = Math.min(minX, img.x); minY = Math.min(minY, img.y);
    maxX = Math.max(maxX, img.x + img.w); maxY = Math.max(maxY, img.y + img.h);
  }
  for (const s of shapes) {
    if (!selectedIds.has(s._id)) continue;
    found = true;
    if (s.type === "text" && s.w != null && s.h != null) {
      minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.w!); maxY = Math.max(maxY, s.y + s.h!);
    } else if (s.type === "arrow" && s.x2 != null && s.y2 != null) {
      minX = Math.min(minX, s.x, s.x2!); minY = Math.min(minY, s.y, s.y2!);
      maxX = Math.max(maxX, s.x, s.x2!); maxY = Math.max(maxY, s.y, s.y2!);
    }
  }
  if (!found) return null;
  return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
}

function intersectsBox(
  ex: number, ey: number, ew: number, eh: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  const left = Math.min(bx, bx + bw), right = Math.max(bx, bx + bw);
  const top = Math.min(by, by + bh), bottom = Math.max(by, by + bh);
  return !(ex + ew < left || ex > right || ey + eh < top || ey > bottom);
}

function computeNewBounds(
  handle: ResizeHandle,
  orig: Bounds,
  dx: number,
  dy: number
): Bounds {
  const MIN = 20;
  let { x, y, w, h } = orig;
  if (handle.includes("e")) w = Math.max(MIN, w + dx);
  if (handle.includes("s")) h = Math.max(MIN, h + dy);
  if (handle.includes("w")) { const d = Math.min(dx, w - MIN); x += d; w -= d; }
  if (handle.includes("n")) { const d = Math.min(dy, h - MIN); y += d; h -= d; }
  return { x, y, w, h };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function CanvasView({ canvasId, sidebarOpen, onToggleSidebar, readOnly = false }: CanvasViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [boxSelect, setBoxSelect] = useState<{
    startX: number; startY: number; currentX: number; currentY: number;
  } | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [drawState, setDrawState] = useState<{
    startX: number; startY: number; currentX: number; currentY: number;
  } | null>(null);

  const groupOpRef = useRef<GroupOpState | null>(null);
  const panStartClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastCursorCanvasPos = useRef<{ x: number; y: number } | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  const canvas = useQuery(api.canvases.get, { id: canvasId });
  const renameMutation = useMutation(api.canvases.rename);
  const setPublicMutation = useMutation(api.canvases.setPublic);
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
    setStyleMutation,
    setContentMutation,
    deleteMutation: deleteShapeMutation,
  } = useShapes(canvasId);

  const { pushHistory, undo, redo } = useUndoRedo();

  // ── Undo/redo-aware commit wrappers ────────────────────────────────────────
  const wrappedCommitImageMove = useCallback(
    async (id: Id<"images">, x: number, y: number, prevX: number, prevY: number) => {
      await commitMove(id, x, y);
      if (x !== prevX || y !== prevY) {
        pushHistory({ undo: () => commitMove(id, prevX, prevY), redo: () => commitMove(id, x, y) });
      }
    },
    [commitMove, pushHistory]
  );

  const wrappedCommitImageResize = useCallback(
    async (id: Id<"images">, x: number, y: number, w: number, h: number,
           prevX: number, prevY: number, prevW: number, prevH: number) => {
      await commitResize(id, x, y, w, h);
      pushHistory({
        undo: () => commitResize(id, prevX, prevY, prevW, prevH),
        redo: () => commitResize(id, x, y, w, h),
      });
    },
    [commitResize, pushHistory]
  );

  const wrappedCommitShapeMove = useCallback(
    async (id: Id<"shapes">, x: number, y: number, prevX: number, prevY: number) => {
      await commitShapeMove(id, x, y);
      if (x !== prevX || y !== prevY) {
        pushHistory({ undo: () => commitShapeMove(id, prevX, prevY), redo: () => commitShapeMove(id, x, y) });
      }
    },
    [commitShapeMove, pushHistory]
  );

  const wrappedCommitShapeResize = useCallback(
    async (id: Id<"shapes">, x: number, y: number, w: number, h: number,
           prevX: number, prevY: number, prevW: number, prevH: number) => {
      await commitShapeResize(id, x, y, w, h);
      pushHistory({
        undo: () => commitShapeResize(id, prevX, prevY, prevW, prevH),
        redo: () => commitShapeResize(id, x, y, w, h),
      });
    },
    [commitShapeResize, pushHistory]
  );

  const wrappedCommitMoveArrow = useCallback(
    async (id: Id<"shapes">, x: number, y: number, x2: number, y2: number,
           prevX: number, prevY: number, prevX2: number, prevY2: number) => {
      await commitMoveArrow(id, x, y, x2, y2);
      pushHistory({
        undo: () => commitMoveArrow(id, prevX, prevY, prevX2, prevY2),
        redo: () => commitMoveArrow(id, x, y, x2, y2),
      });
    },
    [commitMoveArrow, pushHistory]
  );

  const {
    viewport,
    onPointerDown: midMouseDown,
    onPointerMove: midMouseMove,
    onPointerUp: midMouseUp,
    startPan,
    resetViewport,
    zoomIn,
    zoomOut,
    fitViewport,
  } = useCanvas(containerRef);

  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const fitToScreen = useCallback(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;
    for (const img of images) {
      found = true;
      minX = Math.min(minX, img.x); minY = Math.min(minY, img.y);
      maxX = Math.max(maxX, img.x + img.w); maxY = Math.max(maxY, img.y + img.h);
    }
    for (const s of shapes) {
      found = true;
      if (s.type === "text" && s.w != null && s.h != null) {
        minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
        maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h);
      } else if (s.type === "arrow" && s.x2 != null && s.y2 != null) {
        minX = Math.min(minX, s.x, s.x2); minY = Math.min(minY, s.y, s.y2);
        maxX = Math.max(maxX, s.x, s.x2); maxY = Math.max(maxY, s.y, s.y2);
      }
    }
    if (!found) { resetViewport(); return; }
    fitViewport(minX, minY, maxX - minX, maxY - minY);
  }, [images, shapes, fitViewport, resetViewport]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isMultiSelect = selectedIds.size > 1;
  const selectionBounds = isMultiSelect
    ? computeSelectionBounds(selectedIds, images, shapes)
    : null;

  // ── Canvas coord helpers ───────────────────────────────────────────────────
  const TOOLBAR_HEIGHT = 44;
  function clientToCanvas(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - TOOLBAR_HEIGHT - viewport.y) / viewport.scale,
    };
  }

  function getMaxZIndex() {
    return Math.max(0, ...images.map((i) => i.zIndex), ...shapes.map((s) => s.zIndex));
  }

  // ── Group operation helpers ────────────────────────────────────────────────
  function snapshotPositions(): Map<string, OrigElement> {
    const map = new Map<string, OrigElement>();
    for (const img of images) {
      if (!selectedIds.has(img._id)) continue;
      map.set(img._id, { kind: "image", x: img.x, y: img.y, w: img.w, h: img.h });
    }
    for (const s of shapes) {
      if (!selectedIds.has(s._id)) continue;
      if (s.type === "text" && s.w != null && s.h != null) {
        map.set(s._id, { kind: "text", x: s.x, y: s.y, w: s.w!, h: s.h! });
      } else if (s.type === "arrow" && s.x2 != null && s.y2 != null) {
        map.set(s._id, { kind: "arrow", x: s.x, y: s.y, x2: s.x2!, y2: s.y2! });
      }
    }
    return map;
  }

  function applyGroupOffset(map: Map<string, OrigElement>, dx: number, dy: number) {
    for (const [id, orig] of map) {
      if (orig.kind === "image") setLocalPosition(id, orig.x + dx, orig.y + dy);
      else if (orig.kind === "text") setShapeLocalPosition(id, orig.x + dx, orig.y + dy);
      else setLocalArrow(id, orig.x + dx, orig.y + dy, orig.x2 + dx, orig.y2 + dy);
    }
  }

  function applyGroupScale(map: Map<string, OrigElement>, origB: Bounds, newB: Bounds) {
    const sx = newB.w / origB.w;
    const sy = newB.h / origB.h;
    for (const [id, orig] of map) {
      const nx = newB.x + (orig.x - origB.x) * sx;
      const ny = newB.y + (orig.y - origB.y) * sy;
      if (orig.kind === "image") {
        setLocalSize(id, nx, ny, Math.max(10, orig.w * sx), Math.max(10, orig.h * sy));
      } else if (orig.kind === "text") {
        setShapeLocalSize(id, nx, ny, Math.max(10, orig.w * sx), Math.max(10, orig.h * sy));
      } else {
        const nx2 = newB.x + (orig.x2 - origB.x) * sx;
        const ny2 = newB.y + (orig.y2 - origB.y) * sy;
        setLocalArrow(id, nx, ny, nx2, ny2);
      }
    }
  }

  async function commitGroupMove() {
    await Promise.all([
      ...images.filter((img) => selectedIds.has(img._id))
        .map((img) => commitMove(img._id, img.x, img.y)),
      ...shapes.filter((s) => selectedIds.has(s._id))
        .map((s) =>
          s.type === "text"
            ? commitShapeMove(s._id, s.x, s.y)
            : commitMoveArrow(s._id, s.x, s.y, s.x2!, s.y2!)
        ),
    ]);
  }

  async function commitGroupResize() {
    await Promise.all([
      ...images.filter((img) => selectedIds.has(img._id))
        .map((img) => commitResize(img._id, img.x, img.y, img.w, img.h)),
      ...shapes.filter((s) => selectedIds.has(s._id))
        .map((s) =>
          s.type === "text"
            ? commitShapeResize(s._id, s.x, s.y, s.w!, s.h!)
            : commitMoveArrow(s._id, s.x, s.y, s.x2!, s.y2!)
        ),
    ]);
  }

  // ── Group overlay callbacks ────────────────────────────────────────────────
  const handleGroupDragStart = useCallback(
    (startClientX: number, startClientY: number) => {
      groupOpRef.current = {
        startClientX,
        startClientY,
        origPositions: snapshotPositions(),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images, shapes, selectedIds]
  );

  const handleGroupDragMove = useCallback(
    (clientX: number, clientY: number) => {
      const op = groupOpRef.current;
      if (!op) return;
      const dx = (clientX - op.startClientX) / viewport.scale;
      const dy = (clientY - op.startClientY) / viewport.scale;
      applyGroupOffset(op.origPositions, dx, dy);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewport.scale]
  );

  const handleGroupDragEnd = useCallback(async () => {
    const beforePositions = groupOpRef.current?.origPositions;
    const afterImgs = images.filter((img) => selectedIds.has(img._id))
      .map((img) => ({ id: img._id as Id<"images">, x: img.x, y: img.y }));
    const afterShps = shapes.filter((s) => selectedIds.has(s._id))
      .map((s) => ({ id: s._id as Id<"shapes">, x: s.x, y: s.y, x2: s.x2, y2: s.y2, type: s.type }));
    groupOpRef.current = null;
    await commitGroupMove();
    if (beforePositions) {
      pushHistory({
        undo: async () => {
          await Promise.all([
            ...afterImgs.map(({ id }) => {
              const p = beforePositions.get(id);
              return p ? commitMove(id, p.x, p.y) : Promise.resolve();
            }),
            ...afterShps.map(({ id, type }) => {
              const p = beforePositions.get(id);
              if (!p) return Promise.resolve();
              if (type === "text") return commitShapeMove(id, p.x, p.y);
              return commitMoveArrow(id, p.x, p.y, (p as { x2: number; y2: number }).x2, (p as { x2: number; y2: number }).y2);
            }),
          ]);
        },
        redo: async () => {
          await Promise.all([
            ...afterImgs.map(({ id, x, y }) => commitMove(id, x, y)),
            ...afterShps.map(({ id, x, y, x2, y2, type }) => {
              if (type === "text") return commitShapeMove(id, x, y);
              return commitMoveArrow(id, x, y, x2!, y2!);
            }),
          ]);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, shapes, selectedIds]);

  const handleGroupResizeStart = useCallback(
    (handle: ResizeHandle, startClientX: number, startClientY: number) => {
      const origBounds = computeSelectionBounds(selectedIds, images, shapes);
      if (!origBounds) return;
      groupOpRef.current = {
        startClientX,
        startClientY,
        origPositions: snapshotPositions(),
        origBounds,
        handle,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images, shapes, selectedIds]
  );

  const handleGroupResizeMove = useCallback(
    (clientX: number, clientY: number) => {
      const op = groupOpRef.current;
      if (!op?.origBounds || !op.handle) return;
      const dx = (clientX - op.startClientX) / viewport.scale;
      const dy = (clientY - op.startClientY) / viewport.scale;
      const newB = computeNewBounds(op.handle, op.origBounds, dx, dy);
      applyGroupScale(op.origPositions, op.origBounds, newB);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewport.scale]
  );

  const handleGroupResizeEnd = useCallback(async () => {
    const beforePositions = groupOpRef.current?.origPositions;
    const afterImgs = images.filter((img) => selectedIds.has(img._id))
      .map((img) => ({ id: img._id as Id<"images">, x: img.x, y: img.y, w: img.w, h: img.h }));
    const afterShps = shapes.filter((s) => selectedIds.has(s._id))
      .map((s) => ({ id: s._id as Id<"shapes">, x: s.x, y: s.y, w: s.w, h: s.h, x2: s.x2, y2: s.y2, type: s.type }));
    groupOpRef.current = null;
    await commitGroupResize();
    if (beforePositions) {
      pushHistory({
        undo: async () => {
          await Promise.all([
            ...afterImgs.map(({ id }) => {
              const p = beforePositions.get(id);
              return p ? commitResize(id, p.x, p.y, (p as { w: number }).w, (p as { h: number }).h) : Promise.resolve();
            }),
            ...afterShps.map(({ id, type }) => {
              const p = beforePositions.get(id);
              if (!p) return Promise.resolve();
              if (type === "text") {
                const tp = p as { x: number; y: number; w: number; h: number };
                return commitShapeResize(id, tp.x, tp.y, tp.w, tp.h);
              }
              const ap = p as { x: number; y: number; x2: number; y2: number };
              return commitMoveArrow(id, ap.x, ap.y, ap.x2, ap.y2);
            }),
          ]);
        },
        redo: async () => {
          await Promise.all([
            ...afterImgs.map(({ id, x, y, w, h }) => commitResize(id, x, y, w, h)),
            ...afterShps.map(({ id, x, y, w, h, x2, y2, type }) => {
              if (type === "text") return commitShapeResize(id, x, y, w!, h!);
              return commitMoveArrow(id, x, y, x2!, y2!);
            }),
          ]);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, shapes, selectedIds]);

  // ── Canvas pointer handlers ────────────────────────────────────────────────
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button === 1) { midMouseDown(e); return; }
    // Blur any focused input/textarea when clicking the canvas background so that
    // paste events (Ctrl/Cmd+V) land on document.body and aren't blocked by the guard.
    if ((e.target as HTMLElement).dataset.canvasBg === "true") {
      (document.activeElement as HTMLElement | null)?.blur();
    }
    if (readOnly) {
      // In read-only mode only allow panning via left-drag on background
      if ((e.target as HTMLElement).dataset.canvasBg !== "true") return;
      startPan(e.clientX, e.clientY);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if ((e.target as HTMLElement).dataset.canvasBg !== "true") return;
    if (activeTool === "select") {
      startPan(e.clientX, e.clientY);
      panStartClientRef.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (activeTool === "boxselect") {
      const pos = clientToCanvas(e.clientX, e.clientY);
      setBoxSelect({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const pos = clientToCanvas(e.clientX, e.clientY);
    setDrawState({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    midMouseMove(e);
    lastCursorCanvasPos.current = clientToCanvas(e.clientX, e.clientY);
    if (activeTool === "boxselect") {
      if (!boxSelect) return;
      const pos = clientToCanvas(e.clientX, e.clientY);
      setBoxSelect((s) => s ? { ...s, currentX: pos.x, currentY: pos.y } : null);
      return;
    }
    if (!drawState) return;
    const pos = clientToCanvas(e.clientX, e.clientY);
    setDrawState((d) => d ? { ...d, currentX: pos.x, currentY: pos.y } : null);
  }

  async function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    midMouseUp();
    // Deselect on click (not drag) on background with select tool
    if (activeTool === "select" && panStartClientRef.current) {
      const dx = e.clientX - panStartClientRef.current.x;
      const dy = e.clientY - panStartClientRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) < 4) setSelectedIds(new Set());
      panStartClientRef.current = null;
    }
    if (activeTool === "boxselect") {
      if (boxSelect) {
        const { startX, startY, currentX, currentY } = boxSelect;
        const bw = currentX - startX, bh = currentY - startY;
        const ids = new Set<string>();
        for (const img of images) {
          if (intersectsBox(img.x, img.y, img.w, img.h, startX, startY, bw, bh))
            ids.add(img._id);
        }
        for (const s of shapes) {
          if (s.type === "text" && s.w != null && s.h != null) {
            if (intersectsBox(s.x, s.y, s.w!, s.h!, startX, startY, bw, bh))
              ids.add(s._id);
          } else if (s.type === "arrow" && s.x2 != null && s.y2 != null) {
            const ax = Math.min(s.x, s.x2!), ay = Math.min(s.y, s.y2!);
            const aw = Math.abs(s.x2! - s.x), ah = Math.abs(s.y2! - s.y);
            if (intersectsBox(ax, ay, aw, ah, startX, startY, bw, bh))
              ids.add(s._id);
          }
        }
        setSelectedIds(ids);
        setBoxSelect(null);
      }
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
      setSelectedIds(new Set([id]));
      const textEntry: HistoryEntry = {
        undo: () => deleteShapeMutation({ id }),
        redo: async () => {
          const newId = await addShapeMutation({ canvasId, type: "text", x, y, w, h, zIndex: maxZ + 1 });
          textEntry.undo = () => deleteShapeMutation({ id: newId });
          setSelectedIds(new Set([newId]));
        },
      };
      pushHistory(textEntry);
    } else if (activeTool === "arrow") {
      const dx = currentX - startX, dy = currentY - startY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const x2 = length < 20 ? startX + 150 : currentX;
      const y2 = length < 20 ? startY : currentY;
      const id = await addShapeMutation({
        canvasId, type: "arrow", x: startX, y: startY, x2, y2, zIndex: maxZ + 1,
      });
      setSelectedIds(new Set([id]));
      const arrowEntry: HistoryEntry = {
        undo: () => deleteShapeMutation({ id }),
        redo: async () => {
          const newId = await addShapeMutation({ canvasId, type: "arrow", x: startX, y: startY, x2, y2, zIndex: maxZ + 1 });
          arrowEntry.undo = () => deleteShapeMutation({ id: newId });
          setSelectedIds(new Set([newId]));
        },
      };
      pushHistory(arrowEntry);
    }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    if (readOnly) return;
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      const notInInput =
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement);

      // Undo / Redo
      if (mod && notInInput) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); void undo(); return; }
        if ((e.key === "y") || (e.key === "z" && e.shiftKey)) { e.preventDefault(); void redo(); return; }
      }

      const isDeleteKey = e.key === "Delete" || e.key === "Backspace";

      if (isDeleteKey && notInInput && selectedIds.size > 0) {
        const shapesBefore = shapes.filter((s) => selectedIds.has(s._id));
        for (const id of selectedIds) {
          const isImg = images.some((img) => img._id === id);
          if (isImg) void deleteMutation({ id: id as Id<"images"> });
          else void deleteShapeMutation({ id: id as Id<"shapes"> });
        }
        setSelectedIds(new Set());
        // Only shapes can be re-added on undo (image deletes also remove S3 objects)
        if (shapesBefore.length > 0) {
          const entry: HistoryEntry = { undo: async () => {}, redo: async () => {} };
          entry.undo = async () => {
            const newIds: Array<Id<"shapes">> = [];
            for (const s of shapesBefore) {
              const params = s.type === "text"
                ? { canvasId, type: "text" as const, x: s.x, y: s.y, w: s.w!, h: s.h!, zIndex: s.zIndex, content: s.content,
                    textAlign: s.textAlign, isHeadline: s.isHeadline, showBorder: s.showBorder, bgColor: s.bgColor, textColor: s.textColor }
                : { canvasId, type: "arrow" as const, x: s.x, y: s.y, x2: s.x2!, y2: s.y2!, zIndex: s.zIndex };
              const newId = await addShapeMutation(params);
              newIds.push(newId);
            }
            entry.redo = async () => {
              for (const id of newIds) await deleteShapeMutation({ id });
            };
          };
          pushHistory(entry);
        }
      }
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setActiveTool("select");
        setDrawState(null);
        setBoxSelect(null);
      }
      if (notInInput && !mod && selectedIds.size === 0) {
        if (e.key === "v" || e.key === "V") setActiveTool("select");
        if (e.key === "b" || e.key === "B") setActiveTool("boxselect");
        if (e.key === "t" || e.key === "T") setActiveTool("text");
        if (e.key === "a" || e.key === "A") setActiveTool("arrow");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, images, shapes, deleteMutation, deleteShapeMutation, addShapeMutation, canvasId, undo, redo, pushHistory]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(
    async (params: {
      storageKey: string; filename: string; mimeType: string;
      width: number; height: number; x: number; y: number; w: number; h: number;
    }) => {
      try {
        const id = await addMutation({ canvasId, ...params });
        // Undo = delete the uploaded image (also removes S3 object). Redo = no-op (can't re-upload).
        pushHistory({ undo: () => deleteMutation({ id }), redo: async () => {} });
      } catch (err) {
        toast.error(`Failed to add image: ${err instanceof Error ? err.message : "Unknown error"}`);
        throw err;
      }
    },
    [addMutation, canvasId, deleteMutation, pushHistory]
  );

  // ── Clipboard paste ────────────────────────────────────────────────────────
  useEffect(() => {
    if (readOnly) return;
    async function handlePaste(e: ClipboardEvent) {
      // Guard against pasting while an input/textarea actually has focus.
      // Check document.activeElement rather than e.target — Arc (and some other
      // Chromium-based browsers) route paste events to the last-focused element
      // even after it has lost DOM focus, making e.target unreliable.
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      ) return;

      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;

      const MAX_W = 600;
      const MAX_SIZE = 20 * 1024 * 1024;
      if (file.size > MAX_SIZE) { toast.error("Pasted image exceeds 20 MB"); return; }

      // Place at last known cursor position, falling back to canvas center
      const vp = viewportRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      const center = lastCursorCanvasPos.current ?? {
        x: (((rect?.width ?? 800) / 2) - vp.x) / vp.scale,
        y: (((rect?.height ?? 600) / 2) - vp.y) / vp.scale,
      };

      const filename = file.name || "pasted-image.png";
      const toastId = toast.loading("Processing pasted image…");
      try {
        const { blob, width, height, mimeType: outputMimeType } =
          await preprocessImage(file);
        const outputFilename = replaceExtension(filename, outputMimeType);

        toast.loading("Uploading pasted image…", { id: toastId });
        const { uploadUrl, storageKey } = await requestUploadUrl({
          filename: outputFilename, mimeType: outputMimeType, canvasId, fileSizeBytes: blob.size,
        });
        await uploadToS3(blob, outputMimeType, uploadUrl, (pct) => {
          toast.loading(`Uploading… ${Math.round(pct * 100)}%`, { id: toastId });
        });
        const w = Math.min(width, MAX_W);
        const h = Math.round(w * (height / width));
        await handleUpload({
          storageKey, filename, mimeType: outputMimeType, width, height,
          x: center.x - w / 2, y: center.y - h / 2, w, h,
        });
        toast.success("Image pasted", { id: toastId });
      } catch (err) {
        toast.error(`Paste failed: ${err instanceof Error ? err.message : "Unknown"}`, { id: toastId });
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [readOnly, canvasId, handleUpload]);

  function handleRenameCanvas(name: string) {
    void renameMutation({ id: canvasId, name }).catch((err: unknown) => {
      toast.error(`Failed to rename: ${err instanceof Error ? err.message : "Unknown error"}`);
    });
  }

  // ── Element selection helpers ──────────────────────────────────────────────
  function selectOne(id: string) {
    setSelectedIds(new Set([id]));
  }
  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full overflow-hidden">
      <Toolbar
        canvasName={canvas?.name ?? "Loading…"}
        canvasId={canvasId}
        onRenameCanvas={readOnly ? undefined : handleRenameCanvas}
        scale={viewport.scale}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={resetViewport}
        onFitToScreen={fitToScreen}
        onUpload={readOnly ? undefined : () => fileInputRef.current?.click()}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={onToggleSidebar}
        isPublic={canvas?.isPublic ?? false}
        onTogglePublic={readOnly ? undefined : (val) => void setPublicMutation({ id: canvasId, isPublic: val })}
        readOnly={readOnly}
      />

      <UploadZone canvasId={canvasId} viewport={viewport} containerRef={containerRef} onUpload={handleUpload}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            if (!e.target.files) return;
            void processFilesDirect(e.target.files);
            e.target.value = "";
          }}
        />

        <div
          ref={containerRef}
          className="w-full h-full pt-[44px]"
          style={{
            cursor: activeTool === "select" ? "grab" : "crosshair",
            backgroundImage: viewport.scale < 0.25 ? "none" : "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y + TOOLBAR_HEIGHT}px`,
          }}
          data-canvas-bg="true"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Canvas transform container */}
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
            {/* Elements — pointer-events disabled in read-only mode */}
            <div style={{ pointerEvents: readOnly ? "none" : "auto" }}>
            {images.map((img) => (
              <CanvasImage
                key={img._id}
                image={img}
                selected={selectedIds.has(img._id)}
                isGrouped={isMultiSelect && selectedIds.has(img._id)}
                scale={viewport.scale}
                onSelect={(add) => (add ? toggleOne(img._id) : selectOne(img._id))}
                onDeselect={() => setSelectedIds(new Set())}
                onMoveOptimistic={setLocalPosition}
                onCommitMove={wrappedCommitImageMove}
                onCommitResize={wrappedCommitImageResize}
                onResizeOptimistic={setLocalSize}
                onDelete={deleteMutation}
                onBringToFront={() => {
                  const prevZ = img.zIndex;
                  const newZ = getMaxZIndex() + 1;
                  void reorderMutation({ id: img._id, zIndex: newZ });
                  pushHistory({
                    undo: () => reorderMutation({ id: img._id, zIndex: prevZ }),
                    redo: () => reorderMutation({ id: img._id, zIndex: newZ }),
                  });
                }}
                onSendToBack={() => {
                  const prevZ = img.zIndex;
                  void reorderMutation({ id: img._id, zIndex: 0 });
                  pushHistory({
                    undo: () => reorderMutation({ id: img._id, zIndex: prevZ }),
                    redo: () => reorderMutation({ id: img._id, zIndex: 0 }),
                  });
                }}
                onDescriptionChange={(description) => {
                  const prev = img.description ?? "";
                  void descriptionMutation({ id: img._id, description });
                  pushHistory({
                    undo: () => descriptionMutation({ id: img._id, description: prev }),
                    redo: () => descriptionMutation({ id: img._id, description }),
                  });
                }}
                onDescriptionAlignChange={(align) => {
                  const prev = img.descriptionAlign ?? "left";
                  void descriptionAlignMutation({ id: img._id, align });
                  pushHistory({
                    undo: () => descriptionAlignMutation({ id: img._id, align: prev }),
                    redo: () => descriptionAlignMutation({ id: img._id, align }),
                  });
                }}
              />
            ))}

            {shapes.map((shape) => {
              if (shape.type === "text" && shape.w != null && shape.h != null) {
                return (
                  <TextElement
                    key={shape._id}
                    shape={shape as TextShape}
                    selected={selectedIds.has(shape._id)}
                    isGrouped={isMultiSelect && selectedIds.has(shape._id)}
                    scale={viewport.scale}
                    onSelect={(add) => (add ? toggleOne(shape._id) : selectOne(shape._id))}
                    onMoveOptimistic={setShapeLocalPosition}
                    onCommitMove={wrappedCommitShapeMove}
                    onResizeOptimistic={setShapeLocalSize}
                    onCommitResize={wrappedCommitShapeResize}
                    onContentChange={(id, content) => {
                      const prev = shapes.find((s) => s._id === id)?.content ?? "";
                      void setContentMutation({ id, content });
                      pushHistory({
                        undo: () => setContentMutation({ id, content: prev }),
                        redo: () => setContentMutation({ id, content }),
                      });
                    }}
                    onStyleChange={(id, style, prevStyle) => {
                      void setStyleMutation({ id, ...style });
                      if (prevStyle) {
                        pushHistory({
                          undo: () => setStyleMutation({ id, ...prevStyle }),
                          redo: () => setStyleMutation({ id, ...style }),
                        });
                      }
                    }}
                    onDelete={(id) => void deleteShapeMutation({ id })}
                  />
                );
              }
              if (shape.type === "arrow" && shape.x2 != null && shape.y2 != null) {
                return (
                  <ArrowElement
                    key={shape._id}
                    shape={shape as ArrowShape}
                    selected={selectedIds.has(shape._id)}
                    isGrouped={isMultiSelect && selectedIds.has(shape._id)}
                    scale={viewport.scale}
                    onSelect={(add) => (add ? toggleOne(shape._id) : selectOne(shape._id))}
                    onMoveOptimistic={setLocalArrow}
                    onCommitMove={wrappedCommitMoveArrow}
                  />
                );
              }
              return null;
            })}

            </div>{/* end elements wrapper */}

            {/* Group selection overlay (multi-select) */}
            {!readOnly && isMultiSelect && selectionBounds && (
              <GroupSelectionOverlay
                bounds={selectionBounds}
                scale={viewport.scale}
                onDragStart={handleGroupDragStart}
                onDragMove={handleGroupDragMove}
                onDragEnd={handleGroupDragEnd}
                onResizeStart={handleGroupResizeStart}
                onResizeMove={handleGroupResizeMove}
                onResizeEnd={handleGroupResizeEnd}
              />
            )}

            {/* Box-select rubber band */}
            {boxSelect && (
              <div
                style={{
                  position: "absolute",
                  left: Math.min(boxSelect.startX, boxSelect.currentX),
                  top: Math.min(boxSelect.startY, boxSelect.currentY),
                  width: Math.abs(boxSelect.currentX - boxSelect.startX),
                  height: Math.abs(boxSelect.currentY - boxSelect.startY),
                  border: "1.5px solid #3b82f6",
                  background: "rgba(59, 130, 246, 0.07)",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Draw preview: text */}
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

            {/* Draw preview: arrow */}
            {drawState && activeTool === "arrow" && (() => {
              const pad = 20 / viewport.scale;
              const x1 = drawState.startX, y1 = drawState.startY;
              const x2 = drawState.currentX, y2 = drawState.currentY;
              const svgL = Math.min(x1, x2) - pad, svgT = Math.min(y1, y2) - pad;
              const svgW = Math.abs(x2 - x1) + pad * 2, svgH = Math.abs(y2 - y1) + pad * 2;
              return (
                <svg
                  viewBox={`${svgL} ${svgT} ${svgW} ${svgH}`}
                  style={{ position: "absolute", left: svgL, top: svgT, width: svgW, height: svgH, overflow: "visible", pointerEvents: "none" }}
                >
                  <defs>
                    <marker id="preview-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                    </marker>
                  </defs>
                  <line x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#3b82f6"
                    strokeWidth={2 / viewport.scale}
                    strokeDasharray={`${5 / viewport.scale} ${5 / viewport.scale}`}
                    markerEnd="url(#preview-arrowhead)"
                  />
                </svg>
              );
            })()}
          </div>

          {/* Empty canvas hint */}
          {images.length === 0 && shapes.length === 0 && (
            <div
              data-canvas-bg="true"
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="text-center text-muted-foreground select-none">
                <ImagePlus className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium opacity-50">Drop images here or click Upload</p>
              </div>
            </div>
          )}
        </div>
      </UploadZone>

      {!readOnly && <BottomToolbar activeTool={activeTool} onSelectTool={setActiveTool} />}
    </div>
  );

  async function processFilesDirect(files: FileList) {
    const ACCEPTED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const MAX_SIZE = 20 * 1024 * 1024;
    const MAX_W = 600;
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 400;
    const cy = rect ? rect.height / 2 : 300;
    const center = { x: (cx - viewport.x) / viewport.scale, y: (cy - viewport.y) / viewport.scale };
    await Promise.all(
      Array.from(files).map(async (file, i) => {
        if (!ACCEPTED.includes(file.type)) { toast.error(`${file.name}: unsupported type`); return; }
        if (file.size > MAX_SIZE) { toast.error(`${file.name}: exceeds 20MB`); return; }
        const toastId = toast.loading(`Processing ${file.name}…`);
        try {
          const { blob, width, height, mimeType: outputMimeType } =
            await preprocessImage(file);
          const outputFilename = replaceExtension(file.name, outputMimeType);

          toast.loading(`Uploading ${file.name}…`, { id: toastId });
          const { uploadUrl, storageKey } = await requestUploadUrl({
            filename: outputFilename, mimeType: outputMimeType, canvasId, fileSizeBytes: blob.size,
          });
          await uploadToS3(blob, outputMimeType, uploadUrl, (pct) => {
            toast.loading(`Uploading ${file.name}… ${Math.round(pct * 100)}%`, { id: toastId });
          });
          const aspect = height / width;
          const w = Math.min(width, MAX_W);
          const h = Math.round(w * aspect);
          await handleUpload({
            storageKey, filename: file.name, mimeType: outputMimeType, width, height,
            x: center.x - w / 2 + i * 20, y: center.y - h / 2 + i * 20, w, h,
          });
          toast.success(`${file.name} uploaded`, { id: toastId });
        } catch (err) {
          toast.error(`${file.name}: ${err instanceof Error ? err.message : "Failed"}`, { id: toastId });
        }
      })
    );
  }
}
