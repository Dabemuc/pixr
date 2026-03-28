import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { useUser, SignIn } from "@clerk/clerk-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import PublicCanvasPage from "@/pages/PublicCanvasPage";
import Sidebar from "@/components/Sidebar";
import CanvasView from "@/components/CanvasView";
import { Button } from "@/components/ui/button";
import { ImagePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function App() {
  return (
    <Routes>
      <Route path="/p/:canvasId" element={<PublicCanvasPage />} />
      <Route path="*" element={<AuthGate />} />
    </Routes>
  );
}

function AuthGate() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <SignIn routing="hash" />
      </div>
    );
  }

  return <AppContent />;
}

function AppContent() {
  const canvases = useQuery(api.canvases.list);
  const createMutation = useMutation(api.canvases.create);

  const [activeCanvasId, setActiveCanvasId] = useState<Id<"canvases"> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  // Auto-select first canvas when data loads / active canvas is deleted
  useEffect(() => {
    if (!canvases) return;
    if (canvases.length === 0) {
      setActiveCanvasId(null);
      return;
    }
    const stillExists =
      activeCanvasId && canvases.some((c) => c._id === activeCanvasId);
    if (!stillExists) {
      setActiveCanvasId(canvases[0]._id);
    }
  }, [canvases, activeCanvasId]);

  async function handleCreateFirstCanvas() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const id = await createMutation({ name: trimmed });
      setCreateOpen(false);
      setNewName("");
      setActiveCanvasId(id);
    } catch (err) {
      toast.error(
        `Failed to create: ${err instanceof Error ? err.message : "Unknown"}`
      );
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <Sidebar
        canvases={canvases ?? []}
        activeCanvasId={activeCanvasId}
        onSelectCanvas={setActiveCanvasId}
        open={sidebarOpen}
      />

      {/* Mobile backdrop — tap to close sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 bg-black/40 sm:hidden"
          style={{ top: "calc(44px + env(safe-area-inset-top, 0px))" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="w-full overflow-hidden relative">
        {canvases === undefined ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-sm">Loading…</div>
          </div>
        ) : activeCanvasId ? (
          <CanvasView
            canvasId={activeCanvasId}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <ImagePlus className="h-16 w-16 opacity-20" />
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground">
                No canvases yet
              </p>
              <p className="text-sm mt-1">
                Create your first canvas to start organizing images.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              Create your first canvas
            </Button>
          </div>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Canvas</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="first-canvas-name">Name</Label>
            <Input
              id="first-canvas-name"
              className="mt-1"
              placeholder="My Canvas"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateFirstCanvas();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateFirstCanvas()}
              disabled={!newName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
