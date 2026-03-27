import { Fragment, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderInput,
  FolderMinus,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { toast } from "sonner";

interface CanvasEntry {
  _id: Id<"canvases">;
  _creationTime: number;
  name: string;
  updatedAt: number;
  folderId?: Id<"folders">;
  position?: number;
}

interface FolderEntry {
  _id: Id<"folders">;
  _creationTime: number;
  name: string;
  position?: number;
  parentFolderId?: Id<"folders">;
}

interface SidebarProps {
  canvases: CanvasEntry[];
  activeCanvasId: Id<"canvases"> | null;
  onSelectCanvas: (id: Id<"canvases">) => void;
  open: boolean;
}

type DragItem =
  | { type: "canvas"; id: string }
  | { type: "folder"; id: string };

type TreeItem =
  | { kind: "canvas"; id: string; position: number; parentId: string | null; data: CanvasEntry }
  | { kind: "folder"; id: string; position: number; parentId: string | null; data: FolderEntry };

// activeGapKey format: "gap:{parentId|root}:after:{afterId|null}"
// This identifies the visual indicator slot between two items.
function gapKey(parentId: string | null, afterId: string | null) {
  return `gap:${parentId ?? "root"}:after:${afterId ?? "null"}`;
}

export default function Sidebar({
  canvases,
  activeCanvasId,
  onSelectCanvas,
  open,
}: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const folders = (useQuery(api.folders.list) ?? []) as FolderEntry[];

  // Canvas mutations
  const createMutation = useMutation(api.canvases.create);
  const renameMutation = useMutation(api.canvases.rename);
  const deleteMutation = useMutation(api.canvases.deleteCanvas);
  const moveToFolderMutation = useMutation(api.canvases.moveToFolder);
  const reorderCanvasMutation = useMutation(api.canvases.reorder);

  // Folder mutations
  const createFolderMutation = useMutation(api.folders.create);
  const renameFolderMutation = useMutation(api.folders.rename);
  const deleteFolderMutation = useMutation(api.folders.deleteFolder);
  const reorderFolderMutation = useMutation(api.folders.reorder);

  // Canvas dialog state
  const [newCanvasOpen, setNewCanvasOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<Id<"canvases"> | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteId, setDeleteId] = useState<Id<"canvases"> | null>(null);
  const [deleteCanvasName, setDeleteCanvasName] = useState("");

  // Folder dialog state
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<Id<"folders"> | null>(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState("");
  const [deleteFolderId, setDeleteFolderId] = useState<Id<"folders"> | null>(null);
  const [deleteFolderName, setDeleteFolderName] = useState("");

  // Drag state
  const dragItemRef = useRef<DragItem | null>(null);
  // activeGapKey identifies which insertion slot shows the blue indicator line
  const [activeGapKey, setActiveGapKey] = useState<string | null>(null);
  // dragOverFolderId highlights a folder as a "drop into" target
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Collapse state persisted to localStorage
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("pixr:collapsed-folders");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  function toggleFolderCollapsed(folderId: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      try {
        localStorage.setItem("pixr:collapsed-folders", JSON.stringify([...next]));
      } catch { /* ignore */ }
      return next;
    });
  }

  // ── Tree helpers ───────────────────────────────────────────────────────────

  function getChildren(parentId: string | null): TreeItem[] {
    const items: TreeItem[] = [];
    for (const c of canvases) {
      const cParent = (c.folderId as string | undefined) ?? null;
      if (cParent === parentId) {
        items.push({ kind: "canvas", id: c._id as string, position: c.position ?? c._creationTime, parentId, data: c });
      }
    }
    for (const f of folders) {
      const fParent = (f.parentFolderId as string | undefined) ?? null;
      if (fParent === parentId) {
        items.push({ kind: "folder", id: f._id as string, position: f.position ?? f._creationTime, parentId, data: f });
      }
    }
    return items.sort((a, b) => a.position - b.position);
  }

  function computeDropPosition(siblings: TreeItem[], afterId: string | null): number {
    const afterIdx = afterId ? siblings.findIndex((s) => s.id === afterId) : -1;
    const afterItem = afterIdx >= 0 ? siblings[afterIdx] : null;
    const beforeItem = afterIdx + 1 < siblings.length ? siblings[afterIdx + 1] : null;
    const afterPos = afterItem?.position ?? null;
    const beforePos = beforeItem?.position ?? null;
    if (afterPos === null && beforePos === null) return Date.now();
    if (afterPos === null) return beforePos! - 1000;
    if (beforePos === null) return afterPos! + 1000;
    return (afterPos + beforePos) / 2;
  }

  // True if folderId is checkId or a descendant of checkId
  function isFolderOrDescendant(checkId: string, folderId: string | null): boolean {
    if (folderId === null) return false;
    if (folderId === checkId) return true;
    const folder = folders.find((f) => (f._id as string) === folderId);
    if (!folder) return false;
    return isFolderOrDescendant(checkId, (folder.parentFolderId as string | undefined) ?? null);
  }

  // ── Core drop executor ─────────────────────────────────────────────────────

  function executeDrop(dragItem: DragItem, parentId: string | null, afterId: string | null) {
    if (dragItem.type === "folder" && isFolderOrDescendant(dragItem.id, parentId)) return;
    const siblings = getChildren(parentId);
    const position = computeDropPosition(siblings, afterId);
    if (dragItem.type === "canvas") {
      void reorderCanvasMutation({
        id: dragItem.id as Id<"canvases">,
        position,
        folderId: parentId ? (parentId as Id<"folders">) : undefined,
      }).catch((err: unknown) => {
        toast.error(`Failed to move: ${err instanceof Error ? err.message : "Unknown"}`);
      });
    } else {
      void reorderFolderMutation({
        id: dragItem.id as Id<"folders">,
        position,
        parentFolderId: parentId ? (parentId as Id<"folders">) : undefined,
      }).catch((err: unknown) => {
        toast.error(`Failed to move: ${err instanceof Error ? err.message : "Unknown"}`);
      });
    }
  }

  function executeDropIntoFolder(dragItem: DragItem, folderId: string) {
    if (dragItem.type === "folder" && isFolderOrDescendant(dragItem.id, folderId)) return;
    if (collapsedFolders.has(folderId)) toggleFolderCollapsed(folderId);
    const children = getChildren(folderId);
    const position = computeDropPosition(children, children[children.length - 1]?.id ?? null);
    if (dragItem.type === "canvas") {
      void reorderCanvasMutation({
        id: dragItem.id as Id<"canvases">,
        position,
        folderId: folderId as Id<"folders">,
      }).catch((err: unknown) => {
        toast.error(`Failed to move: ${err instanceof Error ? err.message : "Unknown"}`);
      });
    } else {
      void reorderFolderMutation({
        id: dragItem.id as Id<"folders">,
        position,
        parentFolderId: folderId as Id<"folders">,
      }).catch((err: unknown) => {
        toast.error(`Failed to move: ${err instanceof Error ? err.message : "Unknown"}`);
      });
    }
  }

  // ── Drag helpers ───────────────────────────────────────────────────────────

  function onItemDragStart(e: React.DragEvent, item: DragItem) {
    dragItemRef.current = item;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("dragType", item.type);
    e.dataTransfer.setData("itemId", item.id);
  }

  function onItemDragEnd() {
    dragItemRef.current = null;
    setActiveGapKey(null);
    setDragOverFolderId(null);
  }

  // Called by items (canvas rows / folder headers) as they detect cursor position.
  // ratio: 0=top of element, 1=bottom of element
  // For canvas rows: top half = before, bottom half = after
  // For folder headers: top 33% = before, middle 34% = into, bottom 33% = after
  function activateItemDragOver(
    e: React.DragEvent,
    itemId: string,
    parentId: string | null,
    prevSiblingId: string | null,
    mode: "canvas" | "folder"
  ) {
    const dragItem = dragItemRef.current;
    if (!dragItem) return;
    if (dragItem.type === "folder" && isFolderOrDescendant(dragItem.id, parentId)) return;
    if (dragItem.type === "folder" && mode === "folder" && dragItem.id === itemId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;

    if (mode === "folder") {
      if (ratio < 0.33) {
        // Before this folder
        const key = gapKey(parentId, prevSiblingId);
        setDragOverFolderId(null);
        if (activeGapKey !== key) setActiveGapKey(key);
      } else if (ratio > 0.67) {
        // After this folder
        const key = gapKey(parentId, itemId);
        setDragOverFolderId(null);
        if (activeGapKey !== key) setActiveGapKey(key);
      } else {
        // Into this folder
        if (dragItem.type === "folder" && isFolderOrDescendant(dragItem.id, itemId)) return;
        setActiveGapKey(null);
        if (dragOverFolderId !== itemId) setDragOverFolderId(itemId);
      }
    } else {
      // Canvas: top half = before, bottom half = after
      const afterId = ratio < 0.5 ? prevSiblingId : itemId;
      const key = gapKey(parentId, afterId);
      setDragOverFolderId(null);
      if (activeGapKey !== key) setActiveGapKey(key);
    }
  }

  function handleItemDrop(
    e: React.DragEvent,
    itemId: string,
    parentId: string | null,
    prevSiblingId: string | null,
    mode: "canvas" | "folder"
  ) {
    e.preventDefault();
    e.stopPropagation();
    const dragItem = dragItemRef.current;
    setActiveGapKey(null);
    setDragOverFolderId(null);
    dragItemRef.current = null;
    if (!dragItem) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;

    if (mode === "folder") {
      if (ratio < 0.33) {
        executeDrop(dragItem, parentId, prevSiblingId);
      } else if (ratio > 0.67) {
        executeDrop(dragItem, parentId, itemId);
      } else {
        executeDropIntoFolder(dragItem, itemId);
      }
    } else {
      const afterId = ratio < 0.5 ? prevSiblingId : itemId;
      executeDrop(dragItem, parentId, afterId);
    }
  }

  // ── Canvas handlers ────────────────────────────────────────────────────────

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const id = await createMutation({ name: trimmed });
      setNewCanvasOpen(false);
      setNewName("");
      onSelectCanvas(id);
    } catch (err) {
      toast.error(`Failed to create canvas: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  async function handleRename(id: Id<"canvases">) {
    const trimmed = renameDraft.trim();
    setRenamingId(null);
    if (!trimmed) return;
    try {
      await renameMutation({ id, name: trimmed });
    } catch (err) {
      toast.error(`Failed to rename: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  async function handleDelete(id: Id<"canvases">) {
    try {
      await deleteMutation({ id });
      setDeleteId(null);
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  // ── Folder handlers ────────────────────────────────────────────────────────

  async function handleCreateFolder() {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    try {
      await createFolderMutation({ name: trimmed });
      setNewFolderOpen(false);
      setNewFolderName("");
    } catch (err) {
      toast.error(`Failed to create folder: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  async function handleRenameFolder(id: Id<"folders">) {
    const trimmed = renameFolderDraft.trim();
    setRenamingFolderId(null);
    if (!trimmed) return;
    try {
      await renameFolderMutation({ id, name: trimmed });
    } catch (err) {
      toast.error(`Failed to rename folder: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  async function handleDeleteFolder(id: Id<"folders">) {
    try {
      await deleteFolderMutation({ id });
      setDeleteFolderId(null);
    } catch (err) {
      toast.error(`Failed to delete folder: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  // ── Theme ──────────────────────────────────────────────────────────────────

  function nextTheme() {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  }
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  // ── Gap indicator (purely visual, no drag handlers) ────────────────────────

  function GapLine({ parentId, afterId }: { parentId: string | null; afterId: string | null }) {
    const isActive = activeGapKey === gapKey(parentId, afterId);
    return (
      <div className={cn("relative mx-2", isActive ? "h-0.5 my-0.5" : "h-px")}>
        {isActive && <div className="absolute inset-0 bg-primary rounded-full" />}
      </div>
    );
  }

  // ── Canvas row ─────────────────────────────────────────────────────────────

  function CanvasRow({
    canvas,
    indent,
    parentId,
    prevSiblingId,
  }: {
    canvas: CanvasEntry;
    indent: number;
    parentId: string | null;
    prevSiblingId: string | null;
  }) {
    const isActive = activeCanvasId === canvas._id;
    const isRenaming = renamingId === canvas._id;
    const canvasId = canvas._id as string;

    return (
      <div
        draggable={!isRenaming}
        style={{ marginLeft: `${indent}px` }}
        className={cn(
          "group flex items-center gap-2 px-3 py-2 rounded-md mx-2 cursor-pointer transition-colors",
          isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        )}
        onClick={() => { if (!isRenaming) onSelectCanvas(canvas._id); }}
        onDragStart={(e) => onItemDragStart(e, { type: "canvas", id: canvasId })}
        onDragEnd={onItemDragEnd}
        onDragOver={(e) => activateItemDragOver(e, canvasId, parentId, prevSiblingId, "canvas")}
        onDrop={(e) => handleItemDrop(e, canvasId, parentId, prevSiblingId, "canvas")}
      >
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <Input
              className="h-6 text-xs py-0"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => void handleRename(canvas._id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename(canvas._id);
                if (e.key === "Escape") setRenamingId(null);
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <>
              <p className="text-sm font-medium truncate leading-tight">{canvas.name}</p>
              <p className={cn(
                "text-xs truncate",
                isActive ? "text-primary-foreground/70" : "text-muted-foreground"
              )}>
                {formatDistanceToNow(canvas.updatedAt, { addSuffix: true })}
              </p>
            </>
          )}
        </div>

        {!isRenaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100",
                  isActive && "text-primary-foreground hover:text-primary-foreground hover:bg-primary-foreground/20"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingId(canvas._id);
                  setRenameDraft(canvas.name);
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Rename
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="h-3.5 w-3.5 mr-2" />
                  Move to folder
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {canvas.folderId && (
                    <>
                      <DropdownMenuItem
                        onClick={() => void moveToFolderMutation({ id: canvas._id, folderId: undefined })}
                      >
                        <FolderMinus className="h-3.5 w-3.5 mr-2" />
                        Remove from folder
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {folders.length === 0 && (
                    <DropdownMenuItem disabled>No folders yet</DropdownMenuItem>
                  )}
                  {folders.map((folder) => (
                    <DropdownMenuItem
                      key={folder._id}
                      disabled={canvas.folderId === folder._id}
                      onClick={() => void moveToFolderMutation({ id: canvas._id, folderId: folder._id })}
                    >
                      <Folder className="h-3.5 w-3.5 mr-2" />
                      {folder.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteId(canvas._id);
                  setDeleteCanvasName(canvas.name);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }

  // ── Folder section ─────────────────────────────────────────────────────────

  function FolderSection({
    folder,
    indent,
    parentId,
    prevSiblingId,
    children,
  }: {
    folder: FolderEntry;
    indent: number;
    parentId: string | null;
    prevSiblingId: string | null;
    children?: React.ReactNode;
  }) {
    const folderId = folder._id as string;
    const isCollapsed = collapsedFolders.has(folderId);
    const isRenaming = renamingFolderId === folder._id;
    const isDropTarget = dragOverFolderId === folderId;

    return (
      <div>
        {/* Folder header — position-based drag: top=before, middle=into, bottom=after */}
        <div
          style={{ marginLeft: `${indent}px` }}
          className={cn(
            "group flex items-center gap-1 px-2 py-1 mx-2 mt-0.5 rounded-md hover:bg-muted transition-colors",
            isDropTarget && "bg-primary/10 ring-1 ring-primary/40"
          )}
          onDragOver={(e) => activateItemDragOver(e, folderId, parentId, prevSiblingId, "folder")}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragOverFolderId(null);
            }
          }}
          onDrop={(e) => handleItemDrop(e, folderId, parentId, prevSiblingId, "folder")}
        >
          {isRenaming ? (
            <Input
              className="h-6 text-xs py-0 flex-1"
              value={renameFolderDraft}
              onChange={(e) => setRenameFolderDraft(e.target.value)}
              onBlur={() => void handleRenameFolder(folder._id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRenameFolder(folder._id);
                if (e.key === "Escape") setRenamingFolderId(null);
                e.stopPropagation();
              }}
              autoFocus
            />
          ) : (
            <button
              className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-grab active:cursor-grabbing"
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                onItemDragStart(e, { type: "folder", id: folderId });
              }}
              onDragEnd={onItemDragEnd}
              onClick={() => toggleFolderCollapsed(folderId)}
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                  !isCollapsed && "rotate-90"
                )}
              />
              {isCollapsed
                ? <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                : <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              }
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                {folder.name}
              </span>
            </button>
          )}

          {!isRenaming && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setRenamingFolderId(folder._id);
                    setRenameFolderDraft(folder.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setDeleteFolderId(folder._id);
                    setDeleteFolderName(folder.name);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {!isCollapsed && <div>{children}</div>}
      </div>
    );
  }

  // ── Recursive tree render ──────────────────────────────────────────────────
  //
  // Structure per level:
  //   GapLine(afterId=null)   ← drop indicator before first item
  //   item[0]
  //   GapLine(afterId=item[0].id)
  //   item[1]
  //   GapLine(afterId=item[1].id)
  //   ...
  //
  // Items handle their own onDragOver/onDrop using cursor position to
  // determine which of the surrounding GapLines should light up.

  function renderLevel(parentId: string | null, depth: number = 0): React.ReactNode {
    const items = getChildren(parentId);
    const indent = depth * 12;

    return (
      <>
        {/* Gap before the first item (or only gap when folder is empty) */}
        <GapLine parentId={parentId} afterId={null} />

        {items.length === 0 && parentId !== null && (
          <p
            style={{ marginLeft: `${indent + 12}px` }}
            className="px-5 py-1 mx-2 text-xs text-muted-foreground/60 italic"
          >
            Empty folder
          </p>
        )}

        {items.map((item, idx) => {
          const prevSiblingId = idx > 0 ? items[idx - 1].id : null;
          return (
            <Fragment key={item.id}>
              {item.kind === "canvas" ? (
                <CanvasRow
                  canvas={item.data}
                  indent={indent}
                  parentId={parentId}
                  prevSiblingId={prevSiblingId}
                />
              ) : (
                <FolderSection
                  folder={item.data}
                  indent={indent}
                  parentId={parentId}
                  prevSiblingId={prevSiblingId}
                >
                  {!collapsedFolders.has(item.id) && renderLevel(item.id, depth + 1)}
                </FolderSection>
              )}
              {/* Gap after every item — serves as drop indicator between items */}
              <GapLine parentId={parentId} afterId={item.id} />
            </Fragment>
          );
        })}
      </>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "flex flex-col h-full bg-background border-r border-border transition-all duration-200 overflow-hidden shrink-0",
          open ? "w-64" : "w-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-semibold text-sm">Canvases</span>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New Folder</DialogTitle>
                    </DialogHeader>
                    <div className="py-2">
                      <Label htmlFor="folder-name">Name</Label>
                      <Input
                        id="folder-name"
                        className="mt-1"
                        placeholder="My Folder"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleCreateFolder(); }}
                        autoFocus
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
                      <Button onClick={() => void handleCreateFolder()} disabled={!newFolderName.trim()}>
                        Create
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TooltipTrigger>
              <TooltipContent>New folder</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Dialog open={newCanvasOpen} onOpenChange={setNewCanvasOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New Canvas</DialogTitle>
                    </DialogHeader>
                    <div className="py-2">
                      <Label htmlFor="canvas-name">Name</Label>
                      <Input
                        id="canvas-name"
                        className="mt-1"
                        placeholder="My Canvas"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
                        autoFocus
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setNewCanvasOpen(false)}>Cancel</Button>
                      <Button onClick={() => void handleCreate()} disabled={!newName.trim()}>
                        Create
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TooltipTrigger>
              <TooltipContent>New canvas</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Separator />

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-1 flex flex-col">
          {canvases.length === 0 && folders.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              No canvases yet. Click + to create one.
            </p>
          )}

          {renderLevel(null)}

          {/* Bottom drop zone — fills remaining space, drops to end of root */}
          <div
            className="flex-1 min-h-[60px]"
            onDragOver={(e) => {
              const dragItem = dragItemRef.current;
              if (!dragItem) return;
              e.preventDefault();
              setActiveGapKey(null);
              setDragOverFolderId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const dragItem = dragItemRef.current;
              setActiveGapKey(null);
              dragItemRef.current = null;
              if (!dragItem) return;
              const siblings = getChildren(null);
              executeDrop(dragItem, null, siblings[siblings.length - 1]?.id ?? null);
            }}
          />
        </nav>

        <Separator />

        {/* Theme toggle */}
        <div className="px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={nextTheme}
          >
            <ThemeIcon className="h-4 w-4" />
            {theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System"} theme
          </Button>
        </div>

        {/* Canvas delete confirmation */}
        <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete canvas?</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleteCanvasName}" and all its images will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteId && void handleDelete(deleteId)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Folder delete confirmation */}
        <AlertDialog open={deleteFolderId !== null} onOpenChange={(open) => { if (!open) setDeleteFolderId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete folder?</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleteFolderName}" will be deleted. All canvases and nested folders inside will be kept but moved to the root level.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteFolderId && void handleDeleteFolder(deleteFolderId)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </aside>
    </TooltipProvider>
  );
}
