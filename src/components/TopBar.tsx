import { ArrowLeft, List } from "lucide-react";

export default function TopBar({ mode, onMode, onChapters, showChapters }: { mode: "rec" | "edit"; onMode: (m: "rec" | "edit") => void; onChapters?: () => void; showChapters?: boolean }) {
  return (
    <header className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        {showChapters && (
          <button onClick={onChapters} className="flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-sm font-medium text-foreground ring-1 ring-border hover:bg-muted">
            <List className="h-4 w-4" /> Capítulos
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 text-[13px]">
        <span className="text-muted-foreground">Lector</span>
        <span className="font-semibold text-[hsl(var(--rec))]">live</span>
      </div>
    </header>
  );
}

export function BottomBar({ mode, onMode, children }: { mode: "rec" | "edit"; onMode: (m: "rec" | "edit") => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-[hsl(0_0%_4%)] px-4 py-2">
      <div className="flex items-center gap-1">
        <button onClick={() => onMode("rec")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === "rec" ? "bg-primary/15 text-[hsl(var(--rec))] ring-1 ring-[hsl(var(--rec))]/40" : "text-muted-foreground hover:text-foreground"}`}>Gravação</button>
        <button onClick={() => onMode("edit")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === "edit" ? "bg-primary/15 text-[hsl(var(--rec))] ring-1 ring-[hsl(var(--rec))]/40" : "text-muted-foreground hover:text-foreground"}`}>Edição</button>
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}
