import { Pencil, X } from "lucide-react";

type Segment = { slideId: string; time: number; end: number; slide?: { name: string } };

export default function ChaptersPanel({ onClose, segments = [], onSeek }: { onClose: () => void; segments?: Segment[]; onSeek?: (t: number) => void }) {
  const fmt = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const items = segments.length > 0 ? segments : [];
  return (
    <aside className="absolute inset-y-0 left-0 z-30 flex w-[340px] flex-col border-r border-border bg-[hsl(0_0%_5%)] p-5 shadow-2xl">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Lista de capítulos</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto scrollbar-thin pr-1">
        {items.length === 0 && <div className="px-2 py-8 text-center text-sm text-muted-foreground">Sem capítulos. Eles aparecem ao trocar de slide durante a gravação.</div>}
        {items.map((c, i) => (
          <button key={i} onClick={() => onSeek?.(c.time)} className={`group flex w-full items-start gap-2 rounded-md p-2 text-left ${i === 0 ? "border-l-2 border-[hsl(var(--chapter-active))] bg-white/5" : "hover:bg-white/[0.03]"}`}>
            <div className="flex-1 pl-1">
              <div className="text-[13px] font-medium text-foreground">{c.slide?.name ?? `Capítulo ${i + 1}`}</div>
              <div className="mt-0.5 text-[11px] text-[hsl(var(--chapter-active))]">{fmt(c.time)} - {fmt(c.end)}</div>
            </div>
            {i === 0 && (
              <div className="flex items-center gap-1 opacity-80">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <button className="w-full rounded-md border border-border bg-card py-2.5 text-sm font-medium hover:bg-muted">+ Adicionar capítulo</button>
        <button className="w-full rounded-md border border-border bg-card py-2.5 text-sm font-medium hover:bg-muted">Mesclar capítulos</button>
        <button className="w-full rounded-md py-2.5 text-sm font-medium text-[hsl(var(--rec))] hover:bg-white/5">Remover selecionados</button>
      </div>
    </aside>
  );
}
