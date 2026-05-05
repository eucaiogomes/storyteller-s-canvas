import { useState } from "react";
import { ChevronLeft, ChevronRight, Mic, Video, Share2, SkipBack, SkipForward, Layers, Play } from "lucide-react";
import Webcam from "@/components/Webcam";
import DrawToolbar from "@/components/DrawToolbar";
import { BottomBar } from "@/components/TopBar";

export default function RecordView({ onMode }: { onMode: (m: "rec" | "edit") => void }) {
  const [showTools, setShowTools] = useState(true);
  return (
    <div className="flex flex-1 flex-col">
      <div className="relative flex flex-1 items-center justify-center px-8">
        {/* Webcam left */}
        <div className="absolute left-[8%] top-1/2 -translate-y-1/2">
          <Webcam className="h-[240px] w-[300px] border-dashed" label="REC" />
        </div>

        {/* Slide center */}
        <div className="relative flex h-[420px] w-[680px] items-center justify-center rounded-2xl bg-white shadow-2xl">
          <div className="text-center">
            <div className="mx-auto mb-6 inline-block rounded-full bg-primary/15 px-4 py-1 text-[11px] font-semibold tracking-wider text-primary">SLIDE 1</div>
            <h1 className="mb-3 text-4xl font-bold text-zinc-900">Bem-vindo ao Studio</h1>
            <p className="text-sm text-zinc-500">Apresente seus slides enquanto grava. Edite depois sem complicação.</p>
            <div className="mt-8 flex justify-center gap-1.5">
              <span className="h-1 w-8 rounded-full bg-primary" />
              <span className="h-1 w-8 rounded-full bg-zinc-300" />
              <span className="h-1 w-8 rounded-full bg-zinc-300" />
            </div>
          </div>
        </div>

        {/* Right toolbar */}
        {showTools && (
          <div className="absolute right-6 top-1/2 -translate-y-1/2">
            <DrawToolbar onClose={() => setShowTools(false)} />
          </div>
        )}
      </div>

      {/* Slide nav */}
      <div className="flex items-center justify-center gap-2 py-6">
        <button className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><SkipBack className="h-4 w-4" /></button>
        <button className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>
        <div className="flex items-center gap-2 rounded-full bg-card px-4 py-1.5 ring-1 ring-border">
          <Layers className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">1 / 12</span>
        </div>
        <button className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronRight className="h-4 w-4" /></button>
        <button className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><SkipForward className="h-4 w-4" /></button>
      </div>

      <BottomBar mode="rec" onMode={onMode}>
        <button className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Mic className="h-3.5 w-3.5" /> Áudio
        </button>
        <button className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Video className="h-3.5 w-3.5" /> Vídeo
        </button>
        <button className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
          <Share2 className="h-3.5 w-3.5" /> Compartilhar
        </button>
        <button className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--rec))] text-white shadow-lg hover:opacity-90">
          <Play className="h-4 w-4 fill-current" />
        </button>
        <span className="font-mono text-sm tabular-nums text-foreground">00:00</span>
      </BottomBar>
    </div>
  );
}
