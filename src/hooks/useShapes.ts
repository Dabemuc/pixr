import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useState, useCallback } from "react";

type ShapeOverride = Partial<{
  x: number;
  y: number;
  w: number;
  h: number;
  x2: number;
  y2: number;
  content: string;
}>;

export function useShapes(canvasId: Id<"canvases">) {
  const serverShapes = useQuery(api.shapes.listByCanvas, { canvasId }) ?? [];
  const [localOverrides, setLocalOverrides] = useState<Map<string, ShapeOverride>>(new Map());

  const shapes = serverShapes.map((s) => {
    const override = localOverrides.get(s._id);
    return override ? { ...s, ...override } : s;
  });

  const addMutation = useMutation(api.shapes.add);
  const moveMutation = useMutation(api.shapes.move);
  const resizeMutation = useMutation(api.shapes.resize);
  const moveArrowMutation = useMutation(api.shapes.moveArrow);
  const setContentMutation = useMutation(api.shapes.setContent);
  const deleteMutation = useMutation(api.shapes.remove);
  const reorderMutation = useMutation(api.shapes.reorder);

  const setLocalOverride = useCallback((id: string, override: ShapeOverride) => {
    setLocalOverrides((m) => new Map(m).set(id, { ...m.get(id), ...override }));
  }, []);

  const clearLocalOverride = useCallback((id: string) => {
    setLocalOverrides((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
  }, []);

  const setLocalPosition = useCallback(
    (id: string, x: number, y: number) => setLocalOverride(id, { x, y }),
    [setLocalOverride]
  );

  const setLocalSize = useCallback(
    (id: string, x: number, y: number, w: number, h: number) =>
      setLocalOverride(id, { x, y, w, h }),
    [setLocalOverride]
  );

  const setLocalArrow = useCallback(
    (id: string, x: number, y: number, x2: number, y2: number) =>
      setLocalOverride(id, { x, y, x2, y2 }),
    [setLocalOverride]
  );

  const commitMove = useCallback(
    async (id: Id<"shapes">, x: number, y: number) => {
      clearLocalOverride(id);
      await moveMutation({ id, x, y });
    },
    [moveMutation, clearLocalOverride]
  );

  const commitResize = useCallback(
    async (id: Id<"shapes">, x: number, y: number, w: number, h: number) => {
      clearLocalOverride(id);
      await resizeMutation({ id, x, y, w, h });
    },
    [resizeMutation, clearLocalOverride]
  );

  const commitMoveArrow = useCallback(
    async (id: Id<"shapes">, x: number, y: number, x2: number, y2: number) => {
      clearLocalOverride(id);
      await moveArrowMutation({ id, x, y, x2, y2 });
    },
    [moveArrowMutation, clearLocalOverride]
  );

  return {
    shapes,
    setLocalPosition,
    setLocalSize,
    setLocalArrow,
    commitMove,
    commitResize,
    commitMoveArrow,
    addMutation,
    setContentMutation,
    deleteMutation,
    reorderMutation,
  };
}
