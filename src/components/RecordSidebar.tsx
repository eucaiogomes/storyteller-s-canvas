import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, X, Circle, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStudio } from "@/state/studio";

type RecState = "idle" | "recording" | "processing" | "saved";

export default function RecordSidebar({
  open,
  onClose,
  playheadTime,
  onRecordingChange,
}: {
  open: boolean;
  onClose: () => void;
  playheadTime: number;
  onRecordingChange: (recording: boolean) => void;
}) {
  const { setAppendRecording, recording, setRecording } = useStudio();
  const camRef = useRef<HTMLVideoElement>(null);
  const camStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startTime = useRef(0);
  const startAtRef = useRef(0);
  const composeRaf = useRef<number | null>(null);

  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [state, setState] = useState<RecState>("idle");
  const [elapsed, setElapsed] = useState(0);

  // Init / teardown camera with sidebar open state
  useEffect(() => {
    if (!open) {
      // stop on close
      camStream.current?.getTracks().forEach((t) => t.stop());
      screenStream.current?.getTracks().forEach((t) => t.stop());
      camStream.current = null;
      screenStream.current = null;
      setSharing(false);
      setState("idle");
      setElapsed(0);
      return;
    }
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
      .then((s) => {
        camStream.current = s;
        if (camRef.current) camRef.current.srcObject = s;
        s.getVideoTracks().forEach((t) => (t.enabled = camOn));
        s.getAudioTracks().forEach((t) => (t.enabled = micOn));
      })
      .catch(() => toast.error("Não foi possível acessar webcam/microfone"));
    return () => {
      if (composeRaf.current) cancelAnimationFrame(composeRaf.current);
    };
    // eslint-disable-next-line
  }, [open]);

  useEffect(() => { camStream.current?.getVideoTracks().forEach((t) => (t.enabled = camOn)); }, [camOn]);
  useEffect(() => { camStream.current?.getAudioTracks().forEach((t) => (t.enabled = micOn)); }, [micOn]);

  useEffect(() => {
    onRecordingChange(state === "recording");
  }, [state, onRecordingChange]);

  // timer
  useEffect(() => {
    if (state !== "recording") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [state]);

  const toggleScreen = async () => {
    if (state === "recording") return;
    if (sharing) {
      screenStream.current?.getTracks().forEach((t) => t.stop());
      screenStream.current = null;
      setSharing(false);
      return;
    }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStream.current = s;
      setSharing(true);
      s.getVideoTracks()[0].onended = () => { setSharing(false); screenStream.current = null; };
    } catch { /* user cancelled */ }
  };

  const buildComposedStream = (): MediaStream => {
    const cam = camStream.current!;
    const screen = screenStream.current;
    const W = 1280, H = 720;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
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
        if (camOn && camVideo.videoWidth) {
          const pw = 280, ph = 210;
          const px = W - pw - 20, py = H - ph - 20;
          ctx.save();
          ctx.beginPath(); (ctx as any).roundRect?.(px, py, pw, ph, 12); ctx.clip();
          ctx.drawImage(camVideo, px, py, pw, ph);
          ctx.restore();
        }
      } else if (camOn && camVideo.videoWidth) {
        const sw = camVideo.videoWidth, sh = camVideo.videoHeight;
        const scale = Math.max(W / sw, H / sh);
        const dw = sw * scale, dh = sh * scale;
        ctx.drawImage(camVideo, (W - dw) / 2, (H - dh) / 2, dw, dh);
      }
      composeRaf.current = requestAnimationFrame(draw);
    };
    draw();

    const out = canvas.captureStream(30);
    if (micOn) cam.getAudioTracks().forEach((t) => out.addTrack(t));
    return out;
  };

  const startRec = () => {
    if (!camStream.current) return toast.error("Webcam indisponível");
    chunks.current = [];
    startAtRef.current = playheadTime;
    const composed = buildComposedStream();
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus" : "video/webm";
    const rec = new MediaRecorder(composed, { mimeType: mime });
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      if (composeRaf.current) cancelAnimationFrame(composeRaf.current);
      setState("processing");
      const blob = new Blob(chunks.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const dur = (Date.now() - startTime.current) / 1000;
      const result = {
        videoUrl: url,
        duration: dur,
        slides: [],
        slideMarkers: [],
        startAt: startAtRef.current,
      };
      // If no recording yet (empty project), set as base; otherwise append
      if (recording) setAppendRecording(result);
      else setRecording(result);
      setState("saved");
      toast.success("Gravação adicionada");
      // close after small delay for feedback
      setTimeout(() => { onClose(); }, 500);
    };
    rec.start(250);
    recorder.current = rec;
    startTime.current = Date.now();
    setElapsed(0);
    setState("recording");
  };

  const stopRec = () => recorder.current?.stop();

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const isRecording = state === "recording";

  return (
    <aside
      className={`fixed right-0 top-0 z-40 flex h-screen w-[360px] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      aria-hidden={!open}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[hsl(var(--rec))]/15 text-[hsl(var(--rec))]">
            <VideoIcon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Gravar cena</div>
            <div className="text-[11px] text-muted-foreground">
              Inserir em <span className="font-mono">{fmt(playheadTime)}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => { if (isRecording) return; onClose(); }}
          disabled={isRecording}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          title={isRecording ? "Pare a gravação primeiro" : "Fechar"}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Webcam preview - protagonist */}
      <div className="relative m-4 flex-1 overflow-hidden rounded-2xl bg-black ring-1 ring-border">
        {camOn ? (
          <video ref={camRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <VideoOff className="h-10 w-10" />
            <span className="text-xs">Câmera desligada</span>
          </div>
        )}

        {isRecording && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[hsl(var(--rec))] px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            REC <span className="font-mono tabular-nums">{fmt(elapsed)}</span>
          </div>
        )}

        {sharing && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[11px] text-white">
            <MonitorUp className="h-3 w-3" /> Tela
          </div>
        )}
      </div>

      {/* Source toggles */}
      <div className="grid grid-cols-3 gap-2 px-4">
        <SourceBtn active={camOn} disabled={isRecording} onClick={() => setCamOn((v) => !v)} icon={camOn ? <VideoIcon className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />} label="Webcam" />
        <SourceBtn active={micOn} disabled={isRecording} onClick={() => setMicOn((v) => !v)} icon={micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />} label="Áudio" />
        <SourceBtn active={sharing} disabled={isRecording} onClick={toggleScreen} icon={<MonitorUp className="h-4 w-4" />} label="Tela" />
      </div>

      {/* REC button */}
      <div className="flex flex-col items-center gap-2 px-4 py-5">
        {state === "processing" ? (
          <button disabled className="flex w-full items-center justify-center gap-2 rounded-full bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Processando...
          </button>
        ) : !isRecording ? (
          <button
            onClick={startRec}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[hsl(var(--rec))] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            <Circle className="h-4 w-4 fill-current" /> Iniciar gravação
          </button>
        ) : (
          <button
            onClick={stopRec}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[hsl(var(--rec))] px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90"
          >
            <Square className="h-4 w-4 fill-current" /> Parar e salvar
          </button>
        )}
        <p className="text-center text-[11px] text-muted-foreground">
          {isRecording
            ? "Edição desativada durante a gravação"
            : "A gravação será inserida na timeline"}
        </p>
      </div>
    </aside>
  );
}

function SourceBtn({
  active, disabled, onClick, icon, label,
}: { active: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-medium ring-1 transition ${
        active
          ? "bg-primary/10 text-primary ring-primary/40"
          : "bg-card text-muted-foreground ring-border hover:bg-muted"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {icon}
      {label}
    </button>
  );
}
