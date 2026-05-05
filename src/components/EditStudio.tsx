import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SkipBack, Play, Pause, SkipForward, Volume2, Maximize2, Scissors, Trash2, Save,
  Video, Image as ImageIcon, ArrowLeft, List, Upload, Film, Music, Plus, MousePointer2,
  Undo2, Redo2, Presentation,
} from "lucide-react";
import JSZip from "jszip";
import { renderPptxToImages } from "@/lib/pptx";
import { useStudio } from "@/state/studio";
import ChaptersPanel from "@/components/ChaptersPanel";
import RecordSidebar from "@/components/RecordSidebar";
import { toast } from "sonner";

type Kind = "video" | "slide" | "audio" | "image";
type Segment = {
  id: string;
  kind: Kind;
  layer: number;
  start: number;
  srcStart: number;
  srcEnd: number;
  label: string;
  mediaUrl?: string;
  slideUrl?: string;
  /** Original media duration (seconds). When set, srcEnd cannot exceed this.
   *  Undefined = stretchable (images, blank slides). */
  mediaDuration?: number;
};

const uid = () => Math.random().toString(36).slice(2, 9);
const lenOf = (s: Segment) => s.srcEnd - s.srcStart;
const endOf = (s: Segment) => s.start + lenOf(s);
const isStretchable = (s: Segment) => s.mediaDuration === undefined;
const maxSrcEnd = (s: Segment) => (s.mediaDuration ?? Infinity);
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end - 1e-3 && b.start < a.end - 1e-3;

function findFreeLayer(segs: Segment[], start: number, len: number, ignoreId?: string, preferred?: number): number {
  const end = start + len;
  const tryLayer = (L: number) =>
    !segs.some((s) => s.id !== ignoreId && s.layer === L && overlaps({ start, end }, { start: s.start, end: endOf(s) }));
  if (preferred !== undefined && tryLayer(preferred)) return preferred;
  for (let L = 0; L < 64; L++) if (tryLayer(L)) return L;
  return 0;
}

export default function EditStudio() {
  const { recording, setView, appendRecording, setAppendRecording } = useStudio();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const ovVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedId = selectedIds.size === 1 ? Array.from(selectedIds)[0] : null;
  const [zoom, setZoom] = useState(1);

  // ===== Undo / Redo history =====
  const historyRef = useRef<Segment[][]>([]);
  const futureRef = useRef<Segment[][]>([]);
  const skipHistoryRef = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  useEffect(() => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    historyRef.current.push(segments);
    if (historyRef.current.length > 100) historyRef.current.shift();
    futureRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, [segments]);
  const undo = () => {
    if (historyRef.current.length < 2) return;
    const current = historyRef.current.pop()!;
    futureRef.current.push(current);
    const prev = historyRef.current[historyRef.current.length - 1];
    skipHistoryRef.current = true;
    setSegments(prev);
    setHistoryVersion((v) => v + 1);
  };
  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(next);
    skipHistoryRef.current = true;
    setSegments(next);
    setHistoryVersion((v) => v + 1);
  };
  const canUndo = historyRef.current.length > 1;
  const canRedo = futureRef.current.length > 0;

  // ===== Dual markers (in/out) =====
  const [markerIn, setMarkerIn] = useState<number | null>(null);
  const [markerOut, setMarkerOut] = useState<number | null>(null);

  // ===== Rubber-band selection =====
  const [rubberBand, setRubberBand] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const isRubberBanding = useRef(false);

  const toggleSelect = (id: string, additive: boolean) => {
    setSelectedIds((prev) => {
      if (!additive) return new Set([id]);
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Build initial segments
  useEffect(() => {
    if (segments.length > 0) return;
    if (!recording) {
      setSegments([
        { id: uid(), kind: "slide", layer: 0, start: 0, srcStart: 0, srcEnd: 10, label: "Slide em branco" },
      ]);
      return;
    }
    const dur = recording.duration;
    const slideSegs: Segment[] = recording.slideMarkers.map((m, i) => {
      const next = recording.slideMarkers[i + 1]?.time ?? dur;
      const slide = recording.slides.find((s) => s.id === m.slideId);
      return {
        id: uid(), kind: "slide", layer: 0,
        start: m.time, srcStart: 0, srcEnd: next - m.time,
        label: slide?.name ?? `Slide ${i + 1}`, slideUrl: slide?.url,
      };
    });
    const initial: Segment[] = [
      ...slideSegs,
      { id: uid(), kind: "video", layer: 1, start: 0, srcStart: 0, srcEnd: dur, label: "Webcam", mediaUrl: recording.videoUrl, mediaDuration: dur },
      { id: uid(), kind: "audio", layer: 2, start: 0, srcStart: 0, srcEnd: dur, label: "Áudio", mediaUrl: recording.videoUrl, mediaDuration: dur },
    ];
    setSegments(initial);
  }, [recording]); // eslint-disable-line

  // Append new recording
  useEffect(() => {
    if (!appendRecording) return;
    const r = appendRecording;
    setSegments((prev) => {
      const tEnd = prev.reduce((a, s) => Math.max(a, endOf(s)), 0);
      const acc: Segment[] = [...prev];
      const place = (seg: Omit<Segment, "layer" | "id">, preferred?: number) => {
        const layer = findFreeLayer(acc, seg.start, seg.srcEnd - seg.srcStart, undefined, preferred);
        const full: Segment = { ...seg, id: uid(), layer };
        acc.push(full);
      };
      r.slideMarkers.forEach((m, i) => {
        const next = r.slideMarkers[i + 1]?.time ?? r.duration;
        const slide = r.slides.find((s) => s.id === m.slideId);
        place({ kind: "slide", start: tEnd + m.time, srcStart: 0, srcEnd: next - m.time, label: slide?.name ?? "Slide", slideUrl: slide?.url }, 0);
      });
      place({ kind: "video", start: tEnd, srcStart: 0, srcEnd: r.duration, label: "Webcam", mediaUrl: r.videoUrl, mediaDuration: r.duration }, 1);
      place({ kind: "audio", start: tEnd, srcStart: 0, srcEnd: r.duration, label: "Áudio", mediaUrl: r.videoUrl, mediaDuration: r.duration }, 2);
      return acc;
    });
    setAppendRecording(null);
    toast.success("Nova cena adicionada à timeline");
  }, [appendRecording, setAppendRecording]);

  const duration = useMemo(
    () => Math.max(5, segments.reduce((a, s) => Math.max(a, endOf(s)), 0)),
    [segments],
  );
  const layerCount = useMemo(
    () => Math.max(3, segments.reduce((a, s) => Math.max(a, s.layer + 1), 0) + 1),
    [segments],
  );

  const active = useMemo(
    () => segments.filter((s) => time >= s.start && time < endOf(s)).sort((a, b) => a.layer - b.layer),
    [segments, time],
  );
  const mainVideo = active.find((s) => s.kind === "video");
  const mainSlide = active.find((s) => s.kind === "slide");
  const overlayImages = active.filter((s) => s.kind === "image");
  const activeAudios = active.filter((s) => s.kind === "audio" || s.kind === "video");

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!mainVideo?.mediaUrl) { v.removeAttribute("src"); return; }
    if (!v.src.includes(mainVideo.mediaUrl)) v.src = mainVideo.mediaUrl;
  }, [mainVideo?.mediaUrl]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0; let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setTime((prev) => {
        const nt = prev + dt;
        if (nt >= duration) { setPlaying(false); return duration; }
        return nt;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  useEffect(() => {
    const v = videoRef.current;
    if (v && mainVideo) {
      const target = mainVideo.srcStart + (time - mainVideo.start);
      if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target;
      if (playing) v.play().catch(() => {}); else v.pause();
    } else if (v) v.pause();
    Object.entries(audioRefs.current).forEach(([id, el]) => {
      if (!el) return;
      const seg = segments.find((s) => s.id === id);
      if (!seg) return;
      const isActive = activeAudios.some((a) => a.id === id);
      if (isActive) {
        const target = seg.srcStart + (time - seg.start);
        if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
        if (playing) el.play().catch(() => {}); else el.pause();
      } else el.pause();
    });
  }, [time, playing, mainVideo, activeAudios, segments]);

  // ===== ops =====
  const seek = (t: number) => setTime(Math.max(0, Math.min(duration, t)));
  const toggle = () => setPlaying((p) => !p);

  const addSegment = (seg: Omit<Segment, "id" | "layer">) => {
    setSegments((prev) => {
      const layer = findFreeLayer(prev, seg.start, seg.srcEnd - seg.srcStart);
      return [...prev, { ...seg, id: uid(), layer }];
    });
  };

  const splitAtPlayhead = () => {
    // No selection → split ALL clips under the playhead.
    // With selection → split only selected clips under the playhead.
    const pool = selectedIds.size === 0
      ? segments
      : segments.filter((s) => selectedIds.has(s.id));
    const targets = pool.filter(
      (s) => time > s.start + 0.05 && time < endOf(s) - 0.05,
    );
    if (targets.length === 0) {
      return toast.error(
        selectedIds.size === 0
          ? "Posicione o cursor sobre um clip"
          : "Posicione o cursor dentro de um clip selecionado",
      );
    }
    const newSel = new Set<string>();
    setSegments((prev) =>
      prev.flatMap((s) => {
        if (!targets.find((t) => t.id === s.id)) return [s];
        const local = time - s.start;
        const splitSrc = s.srcStart + local;
        const a: Segment = { ...s, id: uid(), srcEnd: splitSrc };
        const b: Segment = { ...s, id: uid(), srcStart: splitSrc, start: s.start + local };
        newSel.add(b.id);
        return [a, b];
      }),
    );
    setSelectedIds(newSel);
    toast.success(`${targets.length} clip(s) dividido(s)`);
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    setSegments((prev) => prev.filter((s) => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
  };

  // Delete segments between markers (in/out region)
  const deleteMarkerRegion = () => {
    if (markerIn === null || markerOut === null) return;
    const lo = Math.min(markerIn, markerOut);
    const hi = Math.max(markerIn, markerOut);
    // Split and remove the region [lo, hi].
    // No selection → apply to ALL segments. With selection → only selected.
    const applyToAll = selectedIds.size === 0;
    setSegments((prev) => {
      const result: Segment[] = [];
      for (const s of prev) {
        const affected = applyToAll || selectedIds.has(s.id);
        if (!affected) { result.push(s); continue; }
        const sEnd = endOf(s);
        // Fully outside region
        if (sEnd <= lo || s.start >= hi) {
          result.push(s);
          continue;
        }
        // Fully inside region — skip (delete)
        if (s.start >= lo && sEnd <= hi) continue;
        // Partially overlapping — keep parts outside
        if (s.start < lo) {
          const trimEnd = lo - s.start;
          result.push({ ...s, id: uid(), srcEnd: s.srcStart + trimEnd });
        }
        if (sEnd > hi) {
          const trimStart = hi - s.start;
          result.push({ ...s, id: uid(), srcStart: s.srcStart + trimStart, start: hi });
        }
      }
      return result;
    });
    toast.success(`Região ${fmt(lo)} → ${fmt(hi)} removida`);
    setMarkerIn(null);
    setMarkerOut(null);
  };

  const trim = (id: string, edge: "start" | "end", deltaSec: number) => {
    setSegments((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      const sameLayer = prev.filter((x) => x.id !== id && x.layer === s.layer);
      if (edge === "start") {
        let newSrcStart = Math.max(0, Math.min(s.srcEnd - 0.1, s.srcStart + deltaSec));
        let newStart = s.start + (newSrcStart - s.srcStart);
        const prevSeg = sameLayer.filter((x) => endOf(x) <= s.start + 1e-3).sort((a, b) => endOf(b) - endOf(a))[0];
        if (prevSeg && newStart < endOf(prevSeg)) {
          const diff = endOf(prevSeg) - newStart;
          newStart += diff; newSrcStart += diff;
          if (newSrcStart >= s.srcEnd) return s;
        }
        return { ...s, srcStart: newSrcStart, start: newStart };
      } else {
        const cap = maxSrcEnd(s);
        let newSrcEnd = Math.max(s.srcStart + 0.1, Math.min(cap, s.srcEnd + deltaSec));
        const newEnd = s.start + (newSrcEnd - s.srcStart);
        const nextSeg = sameLayer.filter((x) => x.start >= endOf(s) - 1e-3).sort((a, b) => a.start - b.start)[0];
        if (nextSeg && newEnd > nextSeg.start) {
          newSrcEnd = s.srcStart + (nextSeg.start - s.start);
          if (newSrcEnd <= s.srcStart) return s;
        }
        return { ...s, srcEnd: newSrcEnd };
      }
    }));
  };

  // ===== Drag preview / insertion indicator (Canva/CapCut style) =====
  type DragItem = { id: string; layer: number; start: number; length: number };
  type DragPreview = {
    anchorId: string;
    items: DragItem[];
    /** Per-layer ripple insertion point (only for the anchor's layer). */
    insertAt: number | null;
    insertLayer: number;
    /** Length used to ripple-shift later clips on insertLayer. */
    rippleLength: number;
  };
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);

  /** Compute snap-aware preview from a proposed (start, layer) for a given anchor segment.
   *  When the anchor is part of a multi-selection, all selected items move with the same
   *  start/layer deltas, preserving relative positioning. */
  const computeDragPreview = useCallback(
    (anchorId: string, proposedStart: number, proposedLayer: number): DragPreview | null => {
      const anchor = segments.find((s) => s.id === anchorId);
      if (!anchor) return null;

      const groupIds =
        selectedIds.has(anchorId) && selectedIds.size > 1
          ? new Set(selectedIds)
          : new Set([anchorId]);
      const group = segments.filter((s) => groupIds.has(s.id));

      // Clamp deltas so no item goes below 0 (start or layer).
      const desiredDStart = Math.max(0, proposedStart) - anchor.start;
      const desiredDLayer = Math.max(0, proposedLayer) - anchor.layer;
      const minStart = Math.min(...group.map((s) => s.start));
      const minLayer = Math.min(...group.map((s) => s.layer));
      const dStart = Math.max(desiredDStart, -minStart);
      const dLayer = Math.max(desiredDLayer, -minLayer);

      const items: DragItem[] = group.map((s) => ({
        id: s.id,
        layer: s.layer + dLayer,
        start: s.start + dStart,
        length: lenOf(s),
      }));

      // Insertion (ripple) only when staying within the anchor's ORIGINAL layer.
      // Cross-layer drags are free placement (Canva/CapCut style).
      const anchorItem = items.find((i) => i.id === anchorId)!;
      const sameLayerAsOrigin = anchorItem.layer === anchor.layer;
      const others = segments.filter((s) => !groupIds.has(s.id) && s.layer === anchorItem.layer);
      const anchorEnd = anchorItem.start + anchorItem.length;
      const overlapping = sameLayerAsOrigin
        ? others.find((s) => anchorItem.start < endOf(s) - 1e-3 && anchorEnd > s.start + 1e-3)
        : undefined;

      if (!overlapping) {
        return {
          anchorId,
          items,
          insertAt: null,
          insertLayer: anchorItem.layer,
          rippleLength: anchorItem.length,
        };
      }
      const draggedCenter = anchorItem.start + anchorItem.length / 2;
      const segCenter = overlapping.start + lenOf(overlapping) / 2;
      const insertAt = draggedCenter < segCenter ? overlapping.start : endOf(overlapping);
      const groupOnLayer = items.filter((i) => i.layer === anchorItem.layer);
      const lo = Math.min(...groupOnLayer.map((i) => i.start));
      const hi = Math.max(...groupOnLayer.map((i) => i.start + i.length));
      return {
        anchorId,
        items,
        insertAt,
        insertLayer: anchorItem.layer,
        rippleLength: hi - lo,
      };
    },
    [segments, selectedIds],
  );

  const updateDragPreview = (id: string, proposedStart: number, proposedLayer: number) => {
    const dp = computeDragPreview(id, proposedStart, proposedLayer);
    dragPreviewRef.current = dp;
    setDragPreview(dp);
  };

  const commitDrag = () => {
    const dp = dragPreviewRef.current;
    dragPreviewRef.current = null;
    setDragPreview(null);
    if (!dp) return;
    setSegments((prev) => {
      const itemsById = new Map(dp.items.map((i) => [i.id, i]));
      const groupIds = new Set(dp.items.map((i) => i.id));

      if (dp.insertAt === null) {
        return prev.map((s) => {
          const it = itemsById.get(s.id);
          return it ? { ...s, start: it.start, layer: it.layer } : s;
        });
      }

      const insertAt = dp.insertAt;
      const insertLayer = dp.insertLayer;
      const rippleLength = dp.rippleLength;
      const groupOnInsertLayer = dp.items.filter((i) => i.layer === insertLayer);
      const groupLo = Math.min(...groupOnInsertLayer.map((i) => i.start));
      const shiftToInsert = insertAt - groupLo;

      return prev.map((s) => {
        const it = itemsById.get(s.id);
        if (it) {
          if (it.layer === insertLayer) {
            return { ...s, start: it.start + shiftToInsert, layer: it.layer };
          }
          return { ...s, start: it.start, layer: it.layer };
        }
        if (!groupIds.has(s.id) && s.layer === insertLayer && s.start >= insertAt - 1e-3) {
          return { ...s, start: s.start + rippleLength };
        }
        return s;
      });
    });
  };

  const cancelDrag = () => {
    dragPreviewRef.current = null;
    setDragPreview(null);
  };

  const onUploadMedia = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      const url = URL.createObjectURL(f);
      const isVideo = f.type.startsWith("video/");
      const isAudio = f.type.startsWith("audio/");
      let dur = 5;
      if (isVideo || isAudio) {
        dur = await new Promise<number>((res) => {
          const el = document.createElement(isVideo ? "video" : "audio") as HTMLMediaElement;
          el.preload = "metadata"; el.src = url;
          el.onloadedmetadata = () => res(el.duration || 5);
          el.onerror = () => res(5);
        });
      }
      const kind: Kind = isAudio ? "audio" : isVideo ? "video" : "image";
      addSegment({
        kind,
        start: time,
        srcStart: 0,
        srcEnd: dur,
        label: f.name,
        mediaUrl: url,
        mediaDuration: isVideo || isAudio ? dur : undefined,
      });
    }
    toast.success("Mídia adicionada");
  };

  const onUploadPptx = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      return toast.error("Selecione um arquivo .pptx");
    }
    const loadingId = toast.loading(`Processando ${file.name}...`);
    try {
      const rendered = await renderPptxToImages(file);
      if (rendered.length === 0) {
        toast.dismiss(loadingId);
        return toast.error("Nenhum slide encontrado");
      }

      const SLIDE_DURATION = 5;
      let cursor = segments.reduce((a, s) => Math.max(a, endOf(s)), 0);
      const newSegs: Segment[] = rendered.map((s, i) => {
        const seg: Segment = {
          id: uid(),
          kind: "slide",
          layer: 0,
          start: cursor,
          srcStart: 0,
          srcEnd: SLIDE_DURATION,
          label: `Slide ${i + 1}`,
          slideUrl: s.url,
        };
        cursor += SLIDE_DURATION;
        return seg;
      });

      setSegments((prev) => {
        const acc = [...prev];
        for (const s of newSegs) {
          const layer = findFreeLayer(acc, s.start, lenOf(s), undefined, 0);
          acc.push({ ...s, layer });
        }
        return acc;
      });
      toast.dismiss(loadingId);
      toast.success(`${newSegs.length} slides importados como capítulos`);
    } catch (err) {
      console.error(err);
      toast.dismiss(loadingId);
      toast.error("Falha ao ler o PowerPoint");
    }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const PX_PER_SEC = 40 * zoom;
  const trackPxWidth = Math.max(duration * PX_PER_SEC, 600);
  const ticks = Math.max(10, Math.ceil(duration));

  const onRulerMouseDown = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const scroll = timelineScrollRef.current?.scrollLeft ?? 0;
    const fromX = (cx: number) => seek((cx - rect.left + scroll) / PX_PER_SEC);
    fromX(e.clientX);
    const move = (ev: MouseEvent) => fromX(ev.clientX);
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ===== Rubber-band selection on empty track area =====
  const onTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start rubber-band if clicking on the track background (not on a segment)
    const target = e.target as HTMLElement;
    if (target.closest("[data-segment]") || target.closest("[data-handle]") || target.dataset.handle) return;
    if (target.closest("[data-ruler]")) return;

    const container = timelineContentRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const startX = e.clientX - containerRect.left;
    const startY = e.clientY - containerRect.top;

    isRubberBanding.current = true;
    setRubberBand({ startX, startY, endX: startX, endY: startY });

    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      setSelectedIds(new Set());
    }

    const move = (ev: MouseEvent) => {
      const endX = ev.clientX - containerRect.left;
      const endY = ev.clientY - containerRect.top;
      setRubberBand({ startX, startY, endX, endY });

      // Calculate which segments intersect the rubber band
      const rbLeft = (Math.min(startX, endX) - 80) / PX_PER_SEC;
      const rbRight = (Math.max(startX, endX) - 80) / PX_PER_SEC;
      const layerHeight = 44; // approximate row height
      const rulerHeight = 28;
      const rbTopLayer = Math.floor((Math.min(startY, endY) - rulerHeight) / layerHeight);
      const rbBottomLayer = Math.floor((Math.max(startY, endY) - rulerHeight) / layerHeight);

      const newSel = new Set<string>();
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
        selectedIds.forEach((id) => newSel.add(id));
      }
      for (const s of segments) {
        const sEnd = endOf(s);
        if (s.start < rbRight && sEnd > rbLeft && s.layer >= rbTopLayer && s.layer <= rbBottomLayer) {
          newSel.add(s.id);
        }
      }
      setSelectedIds(newSel);
    };

    const up = () => {
      isRubberBanding.current = false;
      setRubberBand(null);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [PX_PER_SEC, segments, selectedIds]);

  // Set marker in at current time
  const setMarkerInAtTime = () => {
    setMarkerIn(time);
    toast.success(`Marcador IN → ${fmt(time)}`);
  };
  const setMarkerOutAtTime = () => {
    setMarkerOut(time);
    toast.success(`Marcador OUT → ${fmt(time)}`);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "i" || e.key === "I") { setMarkerIn(time); toast.success(`IN → ${fmt(time)}`); }
      if (e.key === "o" || e.key === "O") { setMarkerOut(time); toast.success(`OUT → ${fmt(time)}`); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size > 0) deleteSelected();
      }
      if (e.key === " ") { e.preventDefault(); toggle(); }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
      if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [time, selectedIds]); // eslint-disable-line

  const chapters = segments
    .filter((s) => s.kind === "slide")
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ slideId: s.id, time: s.start, end: endOf(s), slide: { name: s.label } }));

  const hasMarkerRegion = markerIn !== null && markerOut !== null;
  const markerLo = hasMarkerRegion ? Math.min(markerIn!, markerOut!) : 0;
  const markerHi = hasMarkerRegion ? Math.max(markerIn!, markerOut!) : 0;

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setView("home")} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <button onClick={() => setChaptersOpen(true)} className="flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-sm ring-1 ring-border transition-colors hover:bg-muted">
            <List className="h-4 w-4" /> Capítulos
          </button>
          <button onClick={() => setView("record")} className="flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-sm ring-1 ring-border transition-colors hover:bg-muted">
            <Video className="h-4 w-4" /> Gravar nova cena
          </button>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-sm ring-1 ring-border transition-colors hover:bg-muted">
            <Upload className="h-4 w-4" /> Mídia
            <input type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={(e) => onUploadMedia(e.target.files)} />
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md bg-card px-3 py-1.5 text-sm ring-1 ring-border transition-colors hover:bg-muted">
            <Presentation className="h-4 w-4" /> PowerPoint
            <input
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={(e) => { onUploadPptx(e.target.files); e.currentTarget.value = ""; }}
            />
          </label>
        </div>
        <button onClick={() => toast.success("Projeto salvo")} className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--rec))] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90">
          <Save className="h-4 w-4" /> Salvar
        </button>
      </header>

      {chaptersOpen && <ChaptersPanel onClose={() => setChaptersOpen(false)} segments={chapters} onSeek={seek} />}

      {/* Preview */}
      <PreviewArea
        videoRef={videoRef}
        mainVideo={mainVideo}
        mainSlide={mainSlide}
        overlayImages={overlayImages}
      />

      {/* hidden audio elements */}
      {segments.filter((s) => s.kind === "audio").map((s) => (
        <audio key={s.id} ref={(el) => { audioRefs.current[s.id] = el; }} src={s.mediaUrl} preload="metadata" />
      ))}

      {/* player bar */}
      <div className="px-6">
        <div className="relative h-1 w-full cursor-pointer rounded-full bg-muted" onMouseDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const fromX = (cx: number) => seek(((cx - r.left) / r.width) * duration);
          fromX(e.clientX);
          const move = (ev: MouseEvent) => fromX(ev.clientX);
          const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
        }}>
          <div className="absolute left-0 top-0 h-1 rounded-full bg-[hsl(var(--rec))] transition-[width] duration-75" style={{ width: `${(time / duration) * 100}%` }} />
          <div className="absolute -top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-[hsl(var(--rec))] transition-[left] duration-75" style={{ left: `${(time / duration) * 100}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button onClick={() => seek(0)} className="rounded-full p-1.5 transition-colors hover:bg-muted"><SkipBack className="h-4 w-4" /></button>
            <button onClick={toggle} className="rounded-full bg-primary p-1.5 text-primary-foreground transition-all hover:bg-primary/90 hover:scale-105 active:scale-95">
              {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
            </button>
            <button onClick={() => seek(duration)} className="rounded-full p-1.5 transition-colors hover:bg-muted"><SkipForward className="h-4 w-4" /></button>
          </div>
          <div className="text-xs text-muted-foreground">{mainSlide?.label ?? "—"}</div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Volume2 className="h-4 w-4" />
            <Maximize2 className="h-4 w-4" />
            <span className="font-mono tabular-nums">{fmt(time)} / {fmt(duration)}</span>
          </div>
        </div>
      </div>

      {/* edit toolbar */}
      <div className="mt-2 flex items-center gap-2 px-4 flex-wrap">
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Desfazer (Ctrl+Z)"
          aria-label="Desfazer"
          className="flex items-center justify-center rounded-md bg-card p-1.5 ring-1 ring-border transition-all hover:bg-muted disabled:opacity-40"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Refazer (Ctrl+Shift+Z)"
          aria-label="Refazer"
          className="flex items-center justify-center rounded-md bg-card p-1.5 ring-1 ring-border transition-all hover:bg-muted disabled:opacity-40"
        >
          <Redo2 className="h-4 w-4" />
        </button>
        <div className="h-4 w-px bg-border mx-1" />
        <button
          onClick={() => {
            if (hasMarkerRegion) {
              deleteMarkerRegion();
              return;
            }
            const span = Math.min(3, Math.max(0.5, duration - time));
            const inT = Math.max(0, time);
            const outT = Math.min(duration, time + span);
            setMarkerIn(inT);
            setMarkerOut(outT);
            toast.success("Ajuste os marcadores IN/OUT e clique em Cortar novamente");
          }}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${hasMarkerRegion ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          title={hasMarkerRegion ? "Cortar a região marcada" : "Definir marcadores IN/OUT"}
        >
          <Scissors className="h-3.5 w-3.5" /> {hasMarkerRegion ? "Cortar região" : "Cortar"}
        </button>
        <button onClick={deleteSelected} disabled={selectedIds.size === 0} className="flex items-center gap-1.5 rounded-md bg-card px-2.5 py-1.5 text-xs ring-1 ring-border transition-all hover:bg-muted disabled:opacity-40">
          <Trash2 className="h-3.5 w-3.5" /> Apagar{selectedIds.size > 1 ? ` (${selectedIds.size})` : ""}
        </button>
        {selectedIds.size > 0 && (
          <button onClick={clearSelection} className="rounded-md bg-card px-2.5 py-1.5 text-xs ring-1 ring-border transition-all hover:bg-muted">
            Limpar seleção
          </button>
        )}

        {hasMarkerRegion && (
          <>
            <div className="h-4 w-px bg-border mx-1" />
            <span className="font-mono text-[10px] text-muted-foreground">
              {fmt(markerLo)} → {fmt(markerHi)}
            </span>
            <button onClick={() => { setMarkerIn(null); setMarkerOut(null); }} className="rounded-md bg-card px-2.5 py-1.5 text-xs ring-1 ring-border transition-all hover:bg-muted">
              Cancelar
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))} className="rounded-md px-2 py-1 transition-colors hover:bg-muted">−</button>
          Zoom {Math.round(zoom * 100)}%
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.2))} className="rounded-md px-2 py-1 transition-colors hover:bg-muted">+</button>
        </div>
      </div>

      {/* Timeline */}
      <div ref={timelineScrollRef} className="mt-2 flex-1 overflow-auto bg-[hsl(var(--timeline-bg))] px-2 pb-4 scrollbar-thin select-none">
        <div ref={timelineContentRef} className="relative" style={{ width: trackPxWidth + 80 }} onMouseDown={onTimelineMouseDown}>
          {/* Ruler */}
          <div className="flex" data-ruler>
            <div className="w-20 shrink-0" />
            <div onMouseDown={onRulerMouseDown} data-ruler className="relative cursor-pointer select-none border-b border-border/60 text-[10px] text-muted-foreground" style={{ width: trackPxWidth }}>
              <div className="flex">
                {Array.from({ length: ticks }).map((_, i) => (
                  <div key={i} style={{ width: PX_PER_SEC }} className="border-l border-border/40 px-1 py-1">{fmt(i)}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Layers */}
          {Array.from({ length: layerCount }).map((_, layerIdx) => (
            <LayerRow
              key={layerIdx}
              layerIdx={layerIdx}
              segs={segments.filter((s) => s.layer === layerIdx)}
              pxPerSec={PX_PER_SEC}
              totalPx={trackPxWidth}
              selectedIds={selectedIds}
              toggleSelect={toggleSelect}
              trim={trim}
              dragPreviewItems={dragPreview ? dragPreview.items.filter((i) => i.layer === layerIdx) : []}
              dragInsertAt={dragPreview && dragPreview.insertLayer === layerIdx ? dragPreview.insertAt : null}
              draggingIds={dragPreview ? new Set(dragPreview.items.map((i) => i.id)) : null}
              onDragUpdate={updateDragPreview}
              onDragCommit={commitDrag}
              onDragCancel={cancelDrag}
            />
          ))}

          {/* Marker region highlight */}
          {hasMarkerRegion && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                left: 80 + markerLo * PX_PER_SEC,
                width: (markerHi - markerLo) * PX_PER_SEC,
                background: "linear-gradient(180deg, hsla(0,70%,50%,0.12) 0%, hsla(0,70%,50%,0.06) 100%)",
                borderLeft: "2px solid hsl(142, 71%, 45%)",
                borderRight: "2px solid hsl(0, 84%, 60%)",
              }}
            />
          )}

          {/* Marker IN */}
          {markerIn !== null && (
            <MarkerHandle
              position={80 + markerIn * PX_PER_SEC}
              color="hsl(142, 71%, 45%)"
              label="IN"
              onDrag={(dx) => setMarkerIn((prev) => Math.max(0, Math.min(duration, (prev ?? 0) + dx / PX_PER_SEC)))}
            />
          )}

          {/* Marker OUT */}
          {markerOut !== null && (
            <MarkerHandle
              position={80 + markerOut * PX_PER_SEC}
              color="hsl(0, 84%, 60%)"
              label="OUT"
              onDrag={(dx) => setMarkerOut((prev) => Math.max(0, Math.min(duration, (prev ?? 0) + dx / PX_PER_SEC)))}
            />
          )}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px cursor-grab active:cursor-grabbing"
            style={{ left: 80 + time * PX_PER_SEC, background: "hsl(var(--rec))", transition: playing ? "none" : "left 0.05s ease-out" }}
            onMouseDown={(e) => {
              e.preventDefault();
              const scrollEl = timelineScrollRef.current;
              const startScroll = scrollEl?.scrollLeft ?? 0;
              const startX = e.clientX;
              const startTime = time;
              const move = (ev: MouseEvent) => {
                const dx = ev.clientX - startX + ((scrollEl?.scrollLeft ?? 0) - startScroll);
                seek(startTime + dx / PX_PER_SEC);
              };
              const up = () => {
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
          >
            <div className="absolute -top-0.5 -left-[6px] w-[13px] h-[13px] rounded-sm rotate-45 cursor-grab active:cursor-grabbing" style={{ background: "hsl(var(--rec))" }} />
          </div>

          {/* Rubber band selection rectangle */}
          {rubberBand && (
            <div
              className="absolute pointer-events-none rounded border border-primary/60 z-50"
              style={{
                left: Math.min(rubberBand.startX, rubberBand.endX),
                top: Math.min(rubberBand.startY, rubberBand.endY),
                width: Math.abs(rubberBand.endX - rubberBand.startX),
                height: Math.abs(rubberBand.endY - rubberBand.startY),
                background: "hsla(var(--primary), 0.08)",
              }}
            />
          )}
        </div>
      </div>

      {/* Hint bar */}
      <div className="flex items-center gap-4 border-t border-border bg-card/50 px-4 py-1.5 text-[10px] text-muted-foreground">
        <span><Scissors className="h-3 w-3 inline" /> Cortar: define IN/OUT, arraste para ajustar</span>
        <span><kbd className="rounded bg-muted px-1 py-0.5 text-[9px] font-mono">I</kbd>/<kbd className="rounded bg-muted px-1 py-0.5 text-[9px] font-mono">O</kbd> Mover IN/OUT para o cursor</span>
        <span><kbd className="rounded bg-muted px-1 py-0.5 text-[9px] font-mono">Ctrl</kbd>+Click Seleção múltipla</span>
        <span><MousePointer2 className="h-3 w-3 inline" /> Arraste para selecionar</span>
        <span><kbd className="rounded bg-muted px-1 py-0.5 text-[9px] font-mono">Space</kbd> Play/Pause</span>
        <span><kbd className="rounded bg-muted px-1 py-0.5 text-[9px] font-mono">Del</kbd> Apagar seleção</span>
      </div>
    </div>
  );
}

// ===== Draggable Marker Handle =====
function MarkerHandle({ position, color, label, onDrag }: {
  position: number;
  color: string;
  label: string;
  onDrag: (deltaPx: number) => void;
}) {
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    let last = e.clientX;
    const move = (ev: MouseEvent) => {
      const d = ev.clientX - last;
      last = ev.clientX;
      onDrag(d);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 cursor-ew-resize z-30"
      style={{ left: position, background: color }}
      onMouseDown={onDown}
    >
      <div
        className="absolute -top-1 -left-[10px] flex items-center justify-center w-[21px] h-4 rounded-sm text-[8px] font-bold text-white cursor-ew-resize select-none"
        style={{ background: color }}
      >
        {label}
      </div>
      <div
        className="absolute -bottom-1 -left-[4px] w-[9px] h-[9px] rotate-45"
        style={{ background: color }}
      />
    </div>
  );
}

// ===== Preview Area (unchanged logic) =====
function PreviewArea({
  videoRef,
  mainVideo,
  mainSlide,
  overlayImages,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  mainVideo: Segment | undefined;
  mainSlide: Segment | undefined;
  overlayImages: Segment[];
}) {
  const hasStage = !!mainSlide || overlayImages.length > 0;
  const [pip, setPip] = useState({ x: 16, y: 16, w: 220 });
  const stageRef = useRef<HTMLDivElement>(null);

  const onPipDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const start = { ...pip };
    const stage = stageRef.current?.getBoundingClientRect();
    const move = (ev: MouseEvent) => {
      const nx = start.x + (ev.clientX - startX);
      const ny = start.y + (ev.clientY - startY);
      const maxX = (stage?.width ?? 1000) - start.w - 4;
      const maxY = (stage?.height ?? 600) - (start.w * 9) / 16 - 4;
      setPip((p) => ({ ...p, x: Math.max(4, Math.min(maxX, nx)), y: Math.max(4, Math.min(maxY, ny)) }));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onPipResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = pip.w;
    const move = (ev: MouseEvent) => {
      const nw = Math.max(120, Math.min(600, startW + (ev.clientX - startX)));
      setPip((p) => ({ ...p, w: nw }));
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  if (mainVideo && !hasStage) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 pb-4 pt-4">
        <div className="relative aspect-video h-full max-h-[480px] overflow-hidden rounded-2xl bg-black shadow-lg">
          <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-stretch justify-center px-6 pb-4 pt-4">
      <div
        ref={stageRef}
        className="relative flex h-full max-h-[480px] flex-1 items-center justify-center rounded-2xl bg-[hsl(var(--slide-bg))] p-4 ring-1 ring-white/5 overflow-hidden"
      >
        {mainSlide?.slideUrl ? (
          <img src={mainSlide.slideUrl} alt="slide" className="max-h-full max-w-full rounded-lg object-contain" />
        ) : mainSlide && overlayImages.length === 0 && !mainVideo ? (
          <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
            <ImageIcon className="h-10 w-10 opacity-40" />
            <div className="text-sm">Slide em branco</div>
            <div className="text-xs opacity-70">Use "Mídia" ou "Gravar nova cena" para começar</div>
          </div>
        ) : !mainSlide && overlayImages.length === 0 && !mainVideo ? (
          <div className="text-muted-foreground text-sm">Sem slide ativo</div>
        ) : null}
        {overlayImages.map((o) => (
          <img
            key={o.id}
            src={o.mediaUrl}
            alt={o.label}
            className="pointer-events-none absolute inset-0 h-full w-full rounded-lg object-contain"
          />
        ))}

        {mainVideo && hasStage && (
          <div
            onMouseDown={onPipDown}
            className="absolute cursor-grab active:cursor-grabbing overflow-hidden rounded-2xl bg-black shadow-lg"
            style={{ left: pip.x, top: pip.y, width: pip.w, height: (pip.w * 9) / 16 }}
          >
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted />
            <div
              onMouseDown={onPipResize}
              className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize bg-white/40 rounded-tl"
            />
          </div>
        )}
      </div>
    </div>
  );
}

const KIND_STYLE: Record<Kind, { color: string; Icon: any }> = {
  video: { color: "bg-primary/30 ring-primary/60", Icon: Video },
  slide: { color: "bg-emerald-500/30 ring-emerald-500/60", Icon: ImageIcon },
  audio: { color: "bg-fuchsia-500/25 ring-fuchsia-500/50", Icon: Music },
  image: { color: "bg-amber-500/30 ring-amber-500/60", Icon: Film },
};

function LayerRow({ layerIdx, segs, pxPerSec, totalPx, selectedIds, toggleSelect, trim, dragPreviewItems, dragInsertAt, draggingIds, onDragUpdate, onDragCommit, onDragCancel }: {
  layerIdx: number;
  segs: Segment[];
  pxPerSec: number;
  totalPx: number;
  selectedIds: Set<string>;
  toggleSelect: (id: string, additive: boolean) => void;
  trim: (id: string, edge: "start" | "end", deltaSec: number) => void;
  dragPreviewItems: { id: string; layer: number; start: number; length: number }[];
  dragInsertAt: number | null;
  draggingIds: Set<string> | null;
  onDragUpdate: (id: string, proposedStart: number, proposedLayer: number) => void;
  onDragCommit: () => void;
  onDragCancel: () => void;
}) {
  return (
    <div className="flex items-stretch">
      <div className="flex w-20 shrink-0 items-center gap-1.5 py-2 text-xs text-muted-foreground">
        <Plus className="h-3 w-3 opacity-50" /> Camada {layerIdx + 1}
      </div>
      <div
        className="relative my-1 h-9 rounded bg-[hsl(var(--track-bg))] ring-1 ring-border/50"
        style={{ width: totalPx }}
      >
        {segs.map((s) => {
          const isDragging = !!draggingIds?.has(s.id);
          const left = s.start * pxPerSec;
          const width = (s.srcEnd - s.srcStart) * pxPerSec;
          const selected = selectedIds.has(s.id);
          const style = KIND_STYLE[s.kind];
          return (
            <div
              key={s.id}
              data-segment
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).dataset.handle) return;
                e.stopPropagation();
                const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                if (additive || !selected) toggleSelect(s.id, additive);
                const startX = e.clientX;
                const startY = e.clientY;
                const startStart = s.start;
                const startLayer = s.layer;
                let moved = false;
                const move = (ev: MouseEvent) => {
                  const dx = ev.clientX - startX;
                  const dy = ev.clientY - startY;
                  if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
                  moved = true;
                  const newStart = Math.max(0, startStart + dx / pxPerSec);
                  const layerDelta = Math.round(dy / 44);
                  const newLayer = Math.max(0, startLayer + layerDelta);
                  onDragUpdate(s.id, newStart, newLayer);
                };
                const up = () => {
                  window.removeEventListener("mousemove", move);
                  window.removeEventListener("mouseup", up);
                  if (moved) onDragCommit(); else onDragCancel();
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }}
              className={`group absolute inset-y-0.5 cursor-grab overflow-hidden rounded ring-1 transition-all duration-100 ${style.color} ${selected ? "outline outline-2 outline-[hsl(var(--rec))] z-10" : "hover:brightness-110"} ${isDragging ? "opacity-40" : ""}`}
              style={{ left, width }}
            >
              <div className="flex h-full items-center gap-1 px-1.5 text-[10px] text-foreground/90">
                <style.Icon className="h-3 w-3 opacity-70 shrink-0" />
                <span className="truncate">{s.label}</span>
              </div>
              <Handle onDrag={(d) => trim(s.id, "start", d / pxPerSec)} side="left" />
              <Handle
                onDrag={(d) => trim(s.id, "end", d / pxPerSec)}
                side="right"
                disabled={!isStretchable(s) && s.srcEnd >= (s.mediaDuration ?? Infinity) - 1e-3}
                title={isStretchable(s) ? "Esticar" : `Máx: ${(s.mediaDuration ?? 0).toFixed(1)}s`}
              />
            </div>
          );
        })}

        {/* Ghost previews of dragged clips on this layer */}
        {dragInsertAt === null && dragPreviewItems.map((it) => (
          <div
            key={`ghost-${it.id}`}
            className="pointer-events-none absolute inset-y-0.5 rounded ring-2 ring-dashed ring-primary/80 bg-primary/10 z-20"
            style={{ left: it.start * pxPerSec, width: it.length * pxPerSec }}
          />
        ))}

        {/* Insertion indicator (dotted line at clip edge, Canva/CapCut style) */}
        {dragInsertAt !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 z-30 flex items-center"
            style={{ left: dragInsertAt * pxPerSec - 1 }}
          >
            <div className="h-full w-0.5 bg-primary animate-pulse" style={{ boxShadow: "0 0 8px hsl(var(--primary))" }} />
            <div className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-primary" />
            <div className="absolute -bottom-1 -left-1 h-2 w-2 rounded-full bg-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

function Handle({ side, onDrag, disabled, title }: { side: "left" | "right"; onDrag: (deltaPx: number) => void; disabled?: boolean; title?: string }) {
  const onDown = (e: React.MouseEvent) => {
    if (disabled) return;
    e.stopPropagation();
    let last = e.clientX;
    const move = (ev: MouseEvent) => { const d = ev.clientX - last; last = ev.clientX; onDrag(d); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div data-handle="1" onMouseDown={onDown} title={title}
      className={`absolute inset-y-0 w-1.5 ${disabled ? "cursor-not-allowed bg-foreground/20" : "cursor-ew-resize bg-foreground/40"} opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${side === "left" ? "left-0" : "right-0"}`} />
  );
}
