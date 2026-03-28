import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import CanvasView from "@/components/CanvasView";
import { Globe } from "lucide-react";

export default function PublicCanvasPage() {
  const { canvasId } = useParams<{ canvasId: string }>();
  const canvas = useQuery(
    api.canvases.get,
    canvasId ? { id: canvasId as Id<"canvases"> } : "skip"
  );

  // Still loading
  if (canvas === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  // Not found or not public
  if (canvas === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Globe className="h-12 w-12 opacity-20" />
        <p className="text-lg font-medium text-foreground">Canvas not found</p>
        <p className="text-sm">This canvas doesn't exist or isn't publicly shared.</p>
      </div>
    );
  }

  return (
    <CanvasView
      canvasId={canvasId as Id<"canvases">}
      sidebarOpen={false}
      onToggleSidebar={() => {}}
      readOnly
    />
  );
}
