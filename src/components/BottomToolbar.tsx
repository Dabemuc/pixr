import { MousePointer2, Type, ArrowRight } from "lucide-react";

export type Tool = "select" | "text" | "arrow";

const TOOLS: { id: Tool; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select (V)" },
  { id: "text", icon: Type, label: "Text (T)" },
  { id: "arrow", icon: ArrowRight, label: "Arrow (A)" },
];

interface BottomToolbarProps {
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
}

export default function BottomToolbar({ activeTool, onSelectTool }: BottomToolbarProps) {
  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 px-2 py-1.5 rounded-xl bg-background/95 backdrop-blur-sm border shadow-lg"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {TOOLS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onSelectTool(id)}
          title={label}
          className={`
            flex items-center justify-center w-9 h-9 rounded-lg transition-colors
            ${
              activeTool === id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }
          `}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}
