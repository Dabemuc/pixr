import { useState } from "react";
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
  name: string;
  updatedAt: number;
  folderId?: Id<"folders">;
}

interface FolderEntry {
  _id: Id<"folders">;
  name: string;
}

interface SidebarProps {
  canvases: CanvasEntry[];
  activeCanvasId: Id<"canvases"> | null;
  onSelectCanvas: (id: Id<"canvases">) => void;
  open: boolean;
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

  // Folder mutations
  const createFolderMutation = useMutation(api.folders.create);
  const renameFolderMutation = useMutation(api.folders.rename);
  const deleteFolderMutation = useMutation(api.folders.deleteFolder);

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

  // Drag-and-drop state
  // dragOverTarget: folder ID → hovering that folder; "root" / "root-bottom" → unfoldered zones
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, canvasId: string) {
    e.dataTransfer.setData("canvasId", canvasId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, target: string) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragOverTarget !== target) setDragOverTarget(target);
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear when leaving the element entirely (not moving to a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverTarget(null);
    }
  }

  function handleDrop(e: React.DragEvent, folderId: string | undefined) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const canvasId = e.dataTransfer.getData("canvasId") as Id<"canvases">;
    if (!canvasId) return;
    void moveToFolderMutation({ id: canvasId, folderId: folderId as Id<"folders"> | undefined }).catch((err: unknown) => {
      toast.error(`Failed to move: ${err instanceof Error ? err.message : "Unknown"}`);
    });
  }

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

  // Grouping (derived)
  const unfoldered = canvases.filter((c) => !c.folderId);
  const canvasesByFolder = new Map<string, CanvasEntry[]>();
  for (const canvas of canvases) {
    if (canvas.folderId) {
      const key = canvas.folderId as string;
      const arr = canvasesByFolder.get(key) ?? [];
      arr.push(canvas);
      canvasesByFolder.set(key, arr);
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

  // ── Canvas row ─────────────────────────────────────────────────────────────

  function CanvasRow({ canvas }: { canvas: CanvasEntry }) {
    const isActive = activeCanvasId === canvas._id;
    const isRenaming = renamingId === canvas._id;

    return (
      <div
        draggable={!isRenaming}
        className={cn(
          "group flex items-center gap-2 px-3 py-2 rounded-md mx-2 my-0.5 cursor-pointer transition-colors",
          isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        )}
        onClick={() => { if (!isRenaming) onSelectCanvas(canvas._id); }}
        onDragStart={(e) => handleDragStart(e, canvas._id)}
        onDragEnd={() => setDragOverTarget(null)}
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
                        onClick={() =>
                          void moveToFolderMutation({ id: canvas._id, folderId: undefined })
                        }
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
                      onClick={() =>
                        void moveToFolderMutation({ id: canvas._id, folderId: folder._id })
                      }
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

  function FolderSection({ folder }: { folder: FolderEntry }) {
    const isCollapsed = collapsedFolders.has(folder._id as string);
    const isRenaming = renamingFolderId === folder._id;
    const children = canvasesByFolder.get(folder._id as string) ?? [];

    const isDropTarget = dragOverTarget === (folder._id as string);

    return (
      <div
        onDragOver={(e) => handleDragOver(e, folder._id as string)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          // Expand collapsed folder on drop so the user sees the result
          if (collapsedFolders.has(folder._id as string)) {
            toggleFolderCollapsed(folder._id as string);
          }
          handleDrop(e, folder._id);
        }}
      >
        <div className={cn(
          "group flex items-center gap-1 px-2 py-1 mx-2 mt-1 rounded-md hover:bg-muted transition-colors",
          isDropTarget && "bg-primary/10 ring-1 ring-primary/40"
        )}>
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
              className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
              onClick={() => toggleFolderCollapsed(folder._id as string)}
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
              {children.length > 0 && (
                <span className="text-xs text-muted-foreground/60 ml-auto pr-1">
                  {children.length}
                </span>
              )}
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

        {!isCollapsed && (
          <div className="pl-3">
            {children.map((canvas) => (
              <CanvasRow key={canvas._id} canvas={canvas} />
            ))}
            {children.length === 0 && (
              <p className="px-5 py-1.5 text-xs text-muted-foreground/60 italic">
                Empty folder
              </p>
            )}
          </div>
        )}
      </div>
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

          {/* Unfoldered drop zone */}
          <div
            onDragOver={(e) => handleDragOver(e, "root")}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, undefined)}
            className={cn(
              "rounded-md mx-2 transition-colors",
              dragOverTarget === "root" && unfoldered.length === 0
                ? "min-h-[36px] bg-primary/10 ring-1 ring-primary/40 ring-inset flex items-center justify-center"
                : dragOverTarget === "root"
                ? "ring-1 ring-primary/40 ring-inset"
                : ""
            )}
          >
            {dragOverTarget === "root" && unfoldered.length === 0 && (
              <p className="text-xs text-primary/70">Drop here to remove from folder</p>
            )}
            {unfoldered.map((canvas) => (
              <CanvasRow key={canvas._id} canvas={canvas} />
            ))}
          </div>

          {/* Folders */}
          {folders.map((folder) => (
            <FolderSection key={folder._id} folder={folder} />
          ))}

          {/* Bottom drop zone — invisible, fills remaining space */}
          {folders.length > 0 && (
            <div
              className="flex-1 min-h-[60px]"
              onDragOver={(e) => handleDragOver(e, "root-bottom")}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, undefined)}
            />
          )}
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
                "{deleteFolderName}" will be deleted. All canvases inside will be kept but removed from the folder.
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
