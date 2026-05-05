import { Video, Sparkles, Upload, MonitorPlay } from "lucide-react";
import { useStudio } from "@/state/studio";

export default function Home() {
  const { setView } = useStudio();
  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold">Lector</span>
          <span className="text-[hsl(var(--rec))] font-semibold">studio</span>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-2xl text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="mb-3 text-4xl font-bold tracking-tight">Crie sua videoaula</h1>
          <p className="mb-10 text-muted-foreground">Grave webcam, suba slides, compartilhe tela. Ao salvar, sua timeline aparece pronta para editar.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => setView("record")}
              className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6 text-left transition hover:border-primary hover:bg-card/80"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[hsl(var(--rec))]/15 text-[hsl(var(--rec))]">
                <Video className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">Nova gravação</div>
                <div className="text-sm text-muted-foreground">Webcam, slides e tela compartilhada</div>
              </div>
            </button>
            <button
              disabled
              className="flex cursor-not-allowed flex-col items-start gap-3 rounded-2xl border border-dashed border-border bg-card/50 p-6 text-left opacity-60"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">Importar vídeo</div>
                <div className="text-sm text-muted-foreground">Em breve</div>
              </div>
            </button>
          </div>
          <div className="mt-10 flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Webcam</div>
            <div className="flex items-center gap-1.5"><MonitorPlay className="h-3.5 w-3.5" /> Tela</div>
            <div className="flex items-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Slides</div>
          </div>
        </div>
      </main>
    </div>
  );
}
