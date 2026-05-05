import { Droplet, Minus, Pencil, Square, Circle, Palette, Hexagon, Brush, Eraser, Undo2, Trash2, Type, X } from "lucide-react";

const tools = [Droplet, Minus, Pencil, Square, Circle, Palette, Hexagon, Brush, Eraser, Undo2, Trash2, Type];

export default function DrawToolbar({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-full bg-card/90 px-1.5 py-2 shadow-xl ring-1 ring-border backdrop-blur">
      <button onClick={onClose} className="mb-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      {tools.map((Icon, i) => (
        <button key={i} className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 hover:bg-muted hover:text-foreground">
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
