import { useRef, useState, useCallback } from "react";

export type HistoryEntry = {
  undo: () => Promise<unknown> | void;
  redo: () => Promise<unknown> | void;
};

const MAX_HISTORY = 50;

export function useUndoRedo() {
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  // Bump a counter to trigger re-renders when stacks change
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const pushHistory = useCallback(
    (entry: HistoryEntry) => {
      undoStack.current.push(entry);
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      refresh();
    },
    [refresh]
  );

  const undo = useCallback(async () => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    await entry.undo();
    redoStack.current.push(entry);
    refresh();
  }, [refresh]);

  const redo = useCallback(async () => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    await entry.redo();
    undoStack.current.push(entry);
    refresh();
  }, [refresh]);

  return {
    pushHistory,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
