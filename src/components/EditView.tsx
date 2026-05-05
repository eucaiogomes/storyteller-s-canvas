import { useState } from "react";
import { SkipBack, Play, SkipForward, Volume2, Maximize2, Scissors, Undo2, Redo2, Film, ZoomIn, ZoomOut, Video, Image as ImageIcon, Layout } from "lucide-react";
import Webcam from "@/components/Webcam";
import SlidePreview from "@/components/SlidePreview";
import { BottomBar } from "@/components/TopBar";
import ChaptersPanel from "@/components/ChaptersPanel";

const TIMES = Array.from({ length: 30 }, (_, i) => `00:${String(i).padStart(2, "0")}`);

export default function EditView({ onMode, chaptersOpen, setChaptersOpen }: { onMode: (m: "rec" | "edit") => void; chaptersOpen: boolean; setChaptersOpen: (v: boolean) => void }) {
  const [progress] = useState(50);
  return (
    <div className="relative flex flex-1 flex-col">
      {chaptersOpen && <ChaptersPanel onClose={() => setChaptersOpen(false)} />}

      {/* Preview */}
      <div className="flex flex-1 items-center justify-center gap-6 px-10 pb-4 pt-2">
        <Webcam className="h-[200px] w-[300px]" label="AO VIVO" />
        <div className="h-[420px] w-[820px]">
          <SlidePreview />
        </div>
      </div>

      {/* Player bar */}
      <div className="px-6">
        <div className="relative h-1 w-full rounded-full bg-muted">
          <div className="absolute left-0 top-0 h-1 rounded-full bg-[hsl(var(--rec))]" style={{ width: `${progress}%` }} />
          <div className="absolute -top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-[hsl(var(--rec))]" style={{ left: `${progress}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button className="rounded-full p-1.5 hover:bg-muted"><SkipBack className="h-4 w-4" /></button>
            <button className="rounded-full bg-primary p-1.5 text-primary-foreground hover:bg-primary/90"><Play className="h-4 w-4 fill-current" /></button>
            <button className="rounded-full p-1.5 hover:bg-muted"><SkipForward className="h-4 w-4" /></button>
          </div>
          <div className="text-xs text-muted-foreground">Teste de Aceitação.PNG</div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Volume2 className="h-4 w-4" />
            <div className="h-1 w-20 rounded-full bg-muted">
              <div className="h-1 w-3/4 rounded-full bg-[hsl(var(--rec))]" />
            </div>
            <Maximize2 className="h-4 w-4" />
            <span className="font-mono tabular-nums">00:07 / 00:14</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-2 bg-[hsl(var(--timeline-bg))] px-2 pb-2">
        {/* Ruler */}
        <div className="ml-20 flex select-none border-b border-border/60 text-[10px] text-muted-foreground">
          {TIMES.map((t, i) => (
            <div key={i} className="flex-1 border-l border-border/40 px-1 py-1">{t}</div>
          ))}
        </div>
        {/* Tracks */}
        {[
          { icon: Video, label: "Vídeo" },
          { icon: ImageIcon, label: "Slides" },
          { icon: Volume2, label: "Áudio" },
          { icon: Layout, label: "Layout" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center">
            <div className="flex w-20 items-center gap-1.5 py-1.5 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5" /> {label}
            </div>
            <div className="my-1 h-7 flex-1 rounded bg-[hsl(var(--track-bg))] ring-1 ring-border/50">
              <div className="h-full w-[55%] rounded bg-zinc-700/40" />
            </div>
          </div>
        ))}
      </div>

      <BottomBar mode="edit" onMode={onMode}>
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Scissors className="h-4 w-4" /></button>
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Undo2 className="h-4 w-4" /></button>
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Redo2 className="h-4 w-4" /></button>
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Film className="h-4 w-4" /></button>
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ZoomOut className="h-4 w-4" /></button>
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ZoomIn className="h-4 w-4" /></button>
      </BottomBar>
    </div>
  );
}
