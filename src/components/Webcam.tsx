import { useEffect, useRef } from "react";

export default function Webcam({ className, label = "REC", labelClass }: { className?: string; label?: string; labelClass?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then((s) => { stream = s; if (ref.current) ref.current.srcObject = s; })
      .catch(() => {});
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className={"relative overflow-hidden rounded-xl border-2 border-primary shadow-2xl " + (className ?? "")}>
      <video ref={ref} autoPlay muted playsInline className="h-full w-full object-cover bg-black" />
      <div className={"absolute left-2 top-2 flex items-center gap-1.5 rounded bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white " + (labelClass ?? "")}>
        <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--rec))] animate-pulse" />
        {label}
      </div>
    </div>
  );
}
