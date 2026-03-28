import { useQuery, useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type LocalOverride = { x: number; y: number; w?: number; h?: number };

export function useImages(canvasId: Id<"canvases">) {
  const images = useQuery(api.images.listByCanvas, { canvasId });
  const [localOverrides, setLocalOverrides] = useState<Map<string, LocalOverride>>(
    new Map()
  );

  const moveMutation = useMutation(api.images.move);
  const resizeMutation = useMutation(api.images.resize);
  const reorderMutation = useMutation(api.images.reorder);
  const deleteMutation = useMutation(api.images.deleteImage);
  const addMutation = useMutation(api.images.add);

  const setLocalPosition = useCallback((id: string, x: number, y: number) => {
    setLocalOverrides((m) => new Map(m).set(id, { ...m.get(id), x, y }));
  }, []);

  const setLocalSize = useCallback(
    (id: string, x: number, y: number, w: number, h: number) => {
      setLocalOverrides((m) => new Map(m).set(id, { x, y, w, h }));
    },
    []
  );

  const commitMove = useCallback(
    async (id: Id<"images">, x: number, y: number) => {
      await moveMutation({ id, x, y });
      setLocalOverrides((m) => {
        const n = new Map(m);
        n.delete(id);
        return n;
      });
    },
    [moveMutation]
  );

  const commitResize = useCallback(
    async (id: Id<"images">, x: number, y: number, w: number, h: number) => {
      await resizeMutation({ id, x, y, w, h });
      setLocalOverrides((m) => {
        const n = new Map(m);
        n.delete(id);
        return n;
      });
    },
    [resizeMutation]
  );

  const mergedImages = images?.map((img) => {
    const override = localOverrides.get(img._id);
    return override ? { ...img, ...override } : img;
  });

  return {
    images: mergedImages ?? [],
    isLoading: images === undefined,
    setLocalPosition,
    setLocalSize,
    commitMove,
    commitResize,
    reorderMutation,
    deleteMutation,
    addMutation,
  };
}
