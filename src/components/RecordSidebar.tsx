import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, X, Circle, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStudio } from "@/state/studio";

type RecState = "idle" | "recording" | "processing" | "saved";

/**
 * Inline recording panel: webcam preview rendered alongside the main stage.
 * Shows webcam on the left of the preview, with REC controls below.
 */
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

  useEffect(() => {
    if (!open) {
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
    return () => { if (composeRaf.current) cancelAnimationFrame(composeRaf.current); };
    // eslint-disable-next-line
  }, [open]);

  useEffect(() => { camStream.current?.getVideoTracks().forEach((t) => (t.enabled = camOn)); }, [camOn]);
  useEffect(() => { camStream.current?.getAudioTracks().forEach((t) => (t.enabled = micOn)); }, [micOn]);
  useEffect(() => { onRecordingChange(state === "recording"); }, [state, onRecordingChange]);

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
      const result = { videoUrl: url, duration: dur, slides: [], slideMarkers: [], startAt: startAtRef.current };
      if (recording) setAppendRecording(result);
      else setRecording(result);
      setState("saved");
      toast.success("Gravação adicionada");
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

  if (!open) return null;

  return (
    <div className="flex h-full flex-col items-center gap-3 animate-fade-in">
      {/* Webcam preview block */}
      <div
        className={`relative h-full max-h-[400px] aspect-[3/4] overflow-hidden rounded-2xl bg-black ring-2 transition-all ${
          isRecording ? "ring-[hsl(var(--rec))] shadow-[0_0_0_4px_hsl(var(--rec)/0.15)]" : "ring-primary/40"
        }`}
        style={{ minWidth: 240 }}
      >
        {camOn ? (
          <video ref={camRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <VideoOff className="h-10 w-10" />
            <span className="text-xs">Câmera desligada</span>
          </div>
        )}

        {/* REC badge */}
        {isRecording ? (
          <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-[hsl(var(--rec))] px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            REC <span className="font-mono tabular-nums">{fmt(elapsed)}</span>
          </div>
        ) : (
          <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
            PRÉ-VISUALIZAÇÃO
          </div>
        )}

        {/* Close (X) when idle */}
        {!isRecording && state !== "processing" && (
          <button
            onClick={onClose}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white transition hover:bg-black/80"
            title="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Controls below the webcam */}
      <div className="flex items-center gap-2 rounded-full bg-card px-2 py-1.5 ring-1 ring-border shadow-sm">
        <SourceBtn active={camOn} disabled={isRecording} onClick={() => setCamOn((v) => !v)}
          icon={camOn ? <VideoIcon className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />} title="Webcam" />
        <SourceBtn active={micOn} disabled={isRecording} onClick={() => setMicOn((v) => !v)}
          icon={micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />} title="Microfone" />
        <SourceBtn active={sharing} disabled={isRecording} onClick={toggleScreen}
          icon={<MonitorUp className="h-3.5 w-3.5" />} title="Tela" />

        <div className="mx-1 h-5 w-px bg-border" />

        {state === "processing" ? (
          <button disabled className="flex items-center gap-1.5 rounded-full bg-muted px-4 py-1.5 text-xs font-semibold text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processando
          </button>
        ) : !isRecording ? (
          <button onClick={startRec}
            className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--rec))] px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90">
            <Circle className="h-3 w-3 fill-current" /> Gravar
          </button>
        ) : (
          <button onClick={stopRec}
            className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--rec))] px-4 py-1.5 text-xs font-semibold text-white shadow-lg transition hover:opacity-90">
            <Square className="h-3 w-3 fill-current" /> Parar
          </button>
        )}
      </div>
    </div>
  );
}

function SourceBtn({
  active, disabled, onClick, icon, title,
}: { active: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; title: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {icon}
    </button>
  );
}
