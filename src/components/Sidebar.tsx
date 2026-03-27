import { useState } from "react";
import { useMutation } from "convex/react";
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
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { toast } from "sonner";

interface CanvasEntry {
  _id: Id<"canvases">;
  name: string;
  updatedAt: number;
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
  const createMutation = useMutation(api.canvases.create);
  const renameMutation = useMutation(api.canvases.rename);
  const deleteMutation = useMutation(api.canvases.deleteCanvas);

  const [newCanvasOpen, setNewCanvasOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<Id<"canvases"> | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteId, setDeleteId] = useState<Id<"canvases"> | null>(null);
  const [deleteCanvasName, setDeleteCanvasName] = useState("");

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const id = await createMutation({ name: trimmed });
      setNewCanvasOpen(false);
      setNewName("");
      onSelectCanvas(id);
    } catch (err) {
      toast.error(
        `Failed to create canvas: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  async function handleRename(id: Id<"canvases">) {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    try {
      await renameMutation({ id, name: trimmed });
    } catch (err) {
      toast.error(
        `Failed to rename: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
    setRenamingId(null);
  }

  async function handleDelete(id: Id<"canvases">) {
    try {
      await deleteMutation({ id });
      setDeleteId(null);
    } catch (err) {
      toast.error(
        `Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  function nextTheme() {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  }

  const ThemeIcon =
    theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <aside
      className={cn(
        "flex flex-col h-full bg-background border-r border-border transition-all duration-200 overflow-hidden shrink-0",
        open ? "w-64" : "w-0"
      )}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-semibold text-sm">Canvases</span>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreate();
                }}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setNewCanvasOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleCreate()} disabled={!newName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Separator />

      <nav className="flex-1 overflow-y-auto py-1">
        {canvases.length === 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            No canvases yet. Click + to create one.
          </p>
        )}
        {canvases.map((canvas) => (
          <div
            key={canvas._id}
            className={cn(
              "group flex items-center gap-2 px-3 py-2 rounded-md mx-2 my-0.5 cursor-pointer transition-colors",
              activeCanvasId === canvas._id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
            onClick={() => {
              if (renamingId !== canvas._id) onSelectCanvas(canvas._id);
            }}
          >
            <div className="flex-1 min-w-0">
              {renamingId === canvas._id ? (
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
                  <p className="text-sm font-medium truncate leading-tight">
                    {canvas.name}
                  </p>
                  <p
                    className={cn(
                      "text-xs truncate",
                      activeCanvasId === canvas._id
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    )}
                  >
                    {formatDistanceToNow(canvas.updatedAt, { addSuffix: true })}
                  </p>
                </>
              )}
            </div>

            {renamingId !== canvas._id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100",
                      activeCanvasId === canvas._id &&
                        "text-primary-foreground hover:text-primary-foreground hover:bg-primary-foreground/20"
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
        ))}
      </nav>

      <Separator />

      {/* Footer: theme toggle */}
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

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteCanvasName}" and all its images will be permanently deleted.
              This cannot be undone.
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
    </aside>
  );
}
