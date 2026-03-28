import { useRef, useState, useEffect } from "react";
import { UserButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ZoomIn, ZoomOut, RotateCcw, Upload, PanelLeftClose, PanelLeftOpen, Share2, Check, Copy, Globe, Lock } from "lucide-react";

interface ToolbarProps {
  canvasName: string;
  canvasId?: string;
  onRenameCanvas?: (name: string) => void;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onUpload?: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  isPublic?: boolean;
  onTogglePublic?: (val: boolean) => void;
  readOnly?: boolean;
}

export default function Toolbar({
  canvasName,
  canvasId,
  onRenameCanvas,
  scale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onUpload,
  sidebarOpen,
  onToggleSidebar,
  isPublic = false,
  onTogglePublic,
  readOnly = false,
}: ToolbarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(canvasName);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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
      onRenameCanvas?.(trimmed);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  }

  const shareUrl = canvasId ? `${window.location.origin}/p/${canvasId}` : "";

  function copyLink() {
    if (!shareUrl) return;
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <TooltipProvider>
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 py-2 bg-background/90 backdrop-blur border-b border-border pointer-events-auto">
        {!readOnly && (
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
        )}

        <div className="flex items-center gap-1 flex-1 min-w-0">
          <div className="min-w-0">
            {editing && onRenameCanvas ? (
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
                className={`text-sm font-medium truncate transition-colors text-left max-w-xs ${
                  onRenameCanvas ? "hover:text-primary cursor-text" : "cursor-default"
                }`}
                onClick={() => { if (onRenameCanvas) setEditing(true); }}
                title={onRenameCanvas ? "Click to rename" : undefined}
              >
                {canvasName}
              </button>
            )}
          </div>

          {!readOnly && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 shrink-0 ${isPublic ? "text-primary" : ""}`}
                  onClick={() => setShareOpen(true)}
                >
                  {isPublic ? <Globe className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isPublic ? "Public — click to manage sharing" : "Share"}</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="hidden sm:flex h-8 w-8" onClick={onZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom out</TooltipContent>
          </Tooltip>

          <button
            className="text-xs tabular-nums min-w-[40px] text-center px-1 hover:text-primary transition-colors"
            onClick={onZoomReset}
            title="Reset zoom"
          >
            {Math.round(scale * 100)}%
          </button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="hidden sm:flex h-8 w-8" onClick={onZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom in</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="hidden sm:flex h-8 w-8" onClick={onZoomReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset view</TooltipContent>
          </Tooltip>

          {!readOnly && (
            <>
              <div className="w-px h-5 bg-border mx-1" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" className="h-8 gap-1.5" onClick={onUpload}>
                    <Upload className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Upload</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload images (or drag & drop)</TooltipContent>
              </Tooltip>

              <div className="w-px h-5 bg-border mx-1" />

              <UserButton afterSignOutUrl="/" />
            </>
          )}

          {readOnly && (
            <div className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-md px-2 py-1">
              <Globe className="h-3 w-3" />
              View only
            </div>
          )}
        </div>
      </div>

      {/* Share dialog — only rendered in edit mode */}
      {!readOnly && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          isPublic={isPublic}
          onTogglePublic={onTogglePublic}
          shareUrl={shareUrl}
          copied={copied}
          onCopy={copyLink}
        />
      )}
    </TooltipProvider>
  );
}

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPublic: boolean;
  onTogglePublic?: (val: boolean) => void;
  shareUrl: string;
  copied: boolean;
  onCopy: () => void;
}

function ShareDialog({ open, onOpenChange, isPublic, onTogglePublic, shareUrl, copied, onCopy }: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Share canvas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Public toggle */}
          <button
            onClick={() => onTogglePublic?.(!isPublic)}
            className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
              isPublic
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted"
            }`}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isPublic ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-sm font-medium">{isPublic ? "Public" : "Private"}</p>
              <p className="text-xs text-muted-foreground">
                {isPublic
                  ? "Anyone with the link can view (read-only)"
                  : "Only you can access this canvas"}
              </p>
            </div>
          </button>

          {/* Copy link — only shown when public */}
          {isPublic && shareUrl && (
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="h-8 text-xs"
                onFocus={(e) => e.target.select()}
              />
              <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5" onClick={onCopy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
