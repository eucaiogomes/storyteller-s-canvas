import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, Upload, ChevronLeft, ChevronRight, Save, Square, Circle, X } from "lucide-react";
import { useStudio, Slide } from "@/state/studio";
import { toast } from "sonner";
import { renderPptxToImages } from "@/lib/pptx";

export default function RecordStudio() {
  const { setView, setRecording, recording, setAppendRecording } = useStudio();
  const camRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const camStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startTime = useRef<number>(0);
  const slideMarkers = useRef<{ slideId: string; time: number }[]>([]);

  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [recState, setRecState] = useState<"idle" | "recording" | "paused">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [slideIdx, setSlideIdx] = useState(0);

  // init webcam + mic
  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
      .then((s) => {
        camStream.current = s;
        if (camRef.current) camRef.current.srcObject = s;
      })
      .catch(() => toast.error("Não foi possível acessar webcam/microfone"));
    return () => {
      camStream.current?.getTracks().forEach((t) => t.stop());
      screenStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // toggle tracks
  useEffect(() => { camStream.current?.getVideoTracks().forEach((t) => (t.enabled = camOn)); }, [camOn]);
  useEffect(() => { camStream.current?.getAudioTracks().forEach((t) => (t.enabled = micOn)); }, [micOn]);

  // timer
  useEffect(() => {
    if (recState !== "recording") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [recState]);

  const shareScreen = async () => {
    if (sharing) {
      screenStream.current?.getTracks().forEach((t) => t.stop());
      screenStream.current = null;
      setSharing(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStream.current = s;
      if (screenRef.current) screenRef.current.srcObject = s;
      setSharing(true);
      s.getVideoTracks()[0].onended = () => { setSharing(false); screenStream.current = null; };
    } catch {}
  };

  const [importing, setImporting] = useState(false);
  const onUploadSlides = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    const next: Slide[] = [];
    setImporting(true);
    try {
      for (const f of arr) {
        const isPptx = /\.pptx$/i.test(f.name) || f.type.includes("presentationml");
        if (isPptx) {
          try {
            const rendered = await renderPptxToImages(f);
            if (rendered.length === 0) {
              toast.error(`Nenhum slide encontrado em ${f.name}`);
              continue;
            }
            rendered.forEach((s, i) =>
              next.push({ id: crypto.randomUUID(), url: s.url, name: `${f.name} - ${i + 1}` })
            );
          } catch (e) {
            console.error(e);
            toast.error(`Falha ao processar ${f.name}`);
          }
        } else {
          next.push({ id: crypto.randomUUID(), url: URL.createObjectURL(f), name: f.name });
        }
      }
      if (next.length === 0) return;
      setSlides((p) => [...p, ...next]);
      if (slides.length === 0) setSlideIdx(0);
      toast.success(`${next.length} slide(s) adicionado(s)`);
    } finally {
      setImporting(false);
    }
  };

  const goSlide = (i: number) => {
    if (i < 0 || i >= slides.length) return;
    setSlideIdx(i);
    if (recState === "recording" && slides[i]) {
      slideMarkers.current.push({ slideId: slides[i].id, time: (Date.now() - startTime.current) / 1000 });
    }
  };

  const composeCanvas = useRef<HTMLCanvasElement | null>(null);
  const composeRaf = useRef<number | null>(null);

  const buildComposedStream = (): MediaStream => {
    // Compose screen (background) + webcam (PIP) into a canvas; mix audio from cam mic.
    const cam = camStream.current!;
    const screen = screenStream.current;
    const W = 1280, H = 720;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    composeCanvas.current = canvas;
    const ctx = canvas.getContext("2d")!;

    const camVideo = document.createElement("video");
    camVideo.srcObject = cam; camVideo.muted = true; camVideo.play().catch(() => {});
    let screenVideo: HTMLVideoElement | null = null;
    if (screen) {
      screenVideo = document.createElement("video");
      screenVideo.srcObject = screen; screenVideo.muted = true; screenVideo.play().catch(() => {});
    }

    const draw = () => {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      const hasScreen = !!(screenVideo && screenVideo.videoWidth);
      if (hasScreen) {
        const sw = screenVideo!.videoWidth, sh = screenVideo!.videoHeight;
        const scale = Math.min(W / sw, H / sh);
        const dw = sw * scale, dh = sh * scale;
        ctx.drawImage(screenVideo!, (W - dw) / 2, (H - dh) / 2, dw, dh);
        // cam as PIP only when sharing screen
        if (camOn && camVideo.videoWidth) {
          const pw = 280, ph = 210;
          const px = W - pw - 20, py = H - ph - 20;
          ctx.save();
          ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 12); ctx.clip();
          ctx.drawImage(camVideo, px, py, pw, ph);
          ctx.restore();
          ctx.lineWidth = 3; ctx.strokeStyle = "#ff5a1f";
          ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 12); ctx.stroke();
        }
      } else if (camOn && camVideo.videoWidth) {
        // No screen share: cam fills entire frame (cover)
        const sw = camVideo.videoWidth, sh = camVideo.videoHeight;
        const scale = Math.max(W / sw, H / sh);
        const dw = sw * scale, dh = sh * scale;
        ctx.drawImage(camVideo, (W - dw) / 2, (H - dh) / 2, dw, dh);
      }
      composeRaf.current = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(30);
    cam.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
    return canvasStream;
  };

  const startRec = () => {
    if (!camStream.current) return toast.error("Sem stream de câmera");
    chunks.current = [];
    slideMarkers.current = [];
    if (slides[slideIdx]) slideMarkers.current.push({ slideId: slides[slideIdx].id, time: 0 });
    const composed = buildComposedStream();
    const rec = new MediaRecorder(composed, { mimeType: "video/webm" });
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      if (composeRaf.current) cancelAnimationFrame(composeRaf.current);
      const blob = new Blob(chunks.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const dur = (Date.now() - startTime.current) / 1000;
      const result = { videoUrl: url, duration: dur, slides, slideMarkers: slideMarkers.current };
      if (recording) {
        setAppendRecording(result);
      } else {
        setRecording(result);
      }
      setView("edit");
    };
    rec.start(250);
    recorder.current = rec;
    startTime.current = Date.now();
    setElapsed(0);
    setRecState("recording");
  };

  const stopRec = () => {
    recorder.current?.stop();
    setRecState("idle");
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      {/* top */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <button onClick={() => setView("home")} className="flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-sm ring-1 ring-border hover:bg-muted">
          <X className="h-4 w-4" /> Sair
        </button>
        <div className="flex items-center gap-3 text-sm">
          {recState === "recording" && (
            <div className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--rec))]/15 px-3 py-1 text-[hsl(var(--rec))]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--rec))]" />
              <span className="font-mono tabular-nums">REC {fmt(elapsed)}</span>
            </div>
          )}
          <span className="text-muted-foreground">Lector</span>
          <span className="font-semibold text-[hsl(var(--rec))]">studio</span>
        </div>
      </header>

      {/* stage */}
      <main className="relative flex flex-1 items-center justify-center px-8 py-6">
        {/* main view: screen share OR slide OR placeholder */}
        <div className="relative flex h-full w-full max-w-6xl items-center justify-center">
          {sharing ? (
            <video ref={screenRef} autoPlay playsInline className="max-h-full max-w-full rounded-2xl bg-black object-contain ring-1 ring-border" />
          ) : slides.length > 0 ? (
            <div className="relative flex h-full w-full items-center justify-center">
              <img src={slides[slideIdx].url} alt={slides[slideIdx].name} className="max-h-full max-w-full rounded-2xl bg-white object-contain shadow-2xl" />
              {slides.length > 1 && (
                <>
                  <button onClick={() => goSlide(slideIdx - 1)} disabled={slideIdx === 0} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 disabled:opacity-30">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button onClick={() => goSlide(slideIdx + 1)} disabled={slideIdx === slides.length - 1} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 disabled:opacity-30">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                    {slideIdx + 1} / {slides.length}
                  </div>
                </>
              )}
            </div>
          ) : (
            <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/40 text-muted-foreground hover:border-primary hover:text-foreground">
              <Upload className="h-10 w-10" />
              <div className="text-sm">
                {importing ? "Processando slides..." : "Clique para subir slides (.pptx ou imagens) ou compartilhe a tela"}
              </div>
              <input type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*" multiple className="hidden" disabled={importing} onChange={(e) => onUploadSlides(e.target.files)} />
            </label>
          )}

          {/* webcam pip */}
          {camOn && (
            <div className="absolute bottom-4 right-4 h-[180px] w-[240px] overflow-hidden rounded-xl border-2 border-primary shadow-2xl">
              <video ref={camRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--rec))] animate-pulse" /> AO VIVO
              </div>
            </div>
          )}
        </div>
      </main>

      {/* controls */}
      <footer className="flex items-center justify-between border-t border-border bg-[hsl(0_0%_4%)] px-6 py-3">
        <div className="flex items-center gap-2">
          <label className={`flex cursor-pointer items-center gap-1.5 rounded-md bg-card px-3 py-2 text-sm ring-1 ring-border hover:bg-muted ${importing ? "pointer-events-none opacity-60" : ""}`}>
            <Upload className="h-4 w-4" /> {importing ? "Importando..." : "Slides"}
            <input type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/*" multiple className="hidden" disabled={importing} onChange={(e) => onUploadSlides(e.target.files)} />
          </label>
          {slides.length > 0 && <span className="text-xs text-muted-foreground">{slides.length} slide(s)</span>}
        </div>

        <div className="flex items-center gap-2">
          <CtrlBtn active={micOn} onClick={() => setMicOn((v) => !v)} on={<Mic className="h-4 w-4" />} off={<MicOff className="h-4 w-4" />} />
          <CtrlBtn active={camOn} onClick={() => setCamOn((v) => !v)} on={<VideoIcon className="h-4 w-4" />} off={<VideoOff className="h-4 w-4" />} />
          <CtrlBtn active={sharing} onClick={shareScreen} on={<MonitorUp className="h-4 w-4" />} off={<MonitorUp className="h-4 w-4" />} />
          {recState === "idle" ? (
            <button onClick={startRec} className="ml-2 flex items-center gap-1.5 rounded-full bg-[hsl(var(--rec))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              <Circle className="h-3.5 w-3.5 fill-current" /> Gravar
            </button>
          ) : (
            <button onClick={stopRec} className="ml-2 flex items-center gap-1.5 rounded-full bg-[hsl(var(--rec))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              <Square className="h-3.5 w-3.5 fill-current" /> Parar e salvar
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => recState === "recording" ? stopRec() : setView("home")} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <Save className="h-4 w-4" /> {recState === "recording" ? "Salvar" : "Cancelar"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function CtrlBtn({ active, on, off, onClick }: { active: boolean; on: React.ReactNode; off: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 transition ${active ? "bg-card text-foreground ring-border hover:bg-muted" : "bg-[hsl(var(--rec))]/15 text-[hsl(var(--rec))] ring-[hsl(var(--rec))]/40"}`}>
      {active ? on : off}
    </button>
  );
}
