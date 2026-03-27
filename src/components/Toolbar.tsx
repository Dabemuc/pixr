import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ZoomIn, ZoomOut, RotateCcw, Upload, PanelLeftClose, PanelLeftOpen } from "lucide-react";

interface ToolbarProps {
  canvasName: string;
  onRenameCanvas: (name: string) => void;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onUpload: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function Toolbar({
  canvasName,
  onRenameCanvas,
  scale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onUpload,
  sidebarOpen,
  onToggleSidebar,
}: ToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(canvasName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(canvasName);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, canvasName]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== canvasName) {
      onRenameCanvas(trimmed);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <TooltipProvider>
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 py-2 bg-background/90 backdrop-blur border-b border-border pointer-events-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onToggleSidebar}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sidebarOpen ? "Hide sidebar" : "Show sidebar"}</TooltipContent>
        </Tooltip>

        <div className="flex-1 min-w-0">
          {editing ? (
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              className="h-8 text-sm font-medium max-w-xs"
            />
          ) : (
            <button
              className="text-sm font-medium truncate hover:text-primary transition-colors cursor-text text-left max-w-xs"
              onClick={() => setEditing(true)}
              title="Click to rename"
            >
              {canvasName}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom out</TooltipContent>
          </Tooltip>

          <button
            className="text-xs tabular-nums min-w-[48px] text-center px-1 hover:text-primary transition-colors"
            onClick={onZoomReset}
            title="Reset zoom"
          >
            {Math.round(scale * 100)}%
          </button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom in</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onZoomReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset view</TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5" onClick={onUpload}>
                <Upload className="h-3.5 w-3.5" />
                Upload
              </Button>
            </TooltipTrigger>
            <TooltipContent>Upload images (or drag & drop)</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
