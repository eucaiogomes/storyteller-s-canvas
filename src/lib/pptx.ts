import { init } from "pptx-preview";
import html2canvas from "html2canvas";
import JSZip from "jszip";

export type RenderedSlide = { name: string; url: string; fallback?: boolean };

type SlideMeta = { path: string; name: string; texts: string[] };
type PptxPreviewer = {
  slideCount?: number;
  load(file: ArrayBuffer): Promise<{ slides?: unknown[] } | undefined>;
  renderSingleSlide(slideIndex: number): void;
  destroy?: () => void;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getByLocalName = (doc: Document, name: string) =>
  Array.from(doc.getElementsByTagName("*")).filter((el) => el.localName === name);

const parseXml = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

const normalizeTarget = (target: string) => {
  let path = target.replace(/^\//, "").replace(/^\.\.\//, "");
  if (!path.startsWith("ppt/")) path = `ppt/${path}`;
  return path;
};

const extractTexts = (xml: string) => {
  const doc = parseXml(xml);
  return getByLocalName(doc, "t")
    .map((node) => node.textContent?.trim() ?? "")
    .filter(Boolean);
};

async function preparePptx(file: File): Promise<{ buffer: ArrayBuffer; slides: SlideMeta[] }> {
  const original = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(original);
  const presentationFile = zip.file("ppt/presentation.xml");
  const presentationXml = await presentationFile?.async("text");
  let changed = false;

  if (presentationXml && !/<p:defaultTextStyle\b/.test(presentationXml)) {
    const defaultTextStyle =
      '<p:defaultTextStyle><a:defPPr><a:defRPr lang="pt-BR"/></a:defPPr></p:defaultTextStyle>';
    zip.file("ppt/presentation.xml", presentationXml.replace("</p:presentation>", `${defaultTextStyle}</p:presentation>`));
    changed = true;
  }

  const relsXml = await zip.file("ppt/_rels/presentation.xml.rels")?.async("text");
  const relMap = new Map<string, string>();
  if (relsXml) {
    const relsDoc = parseXml(relsXml);
    getByLocalName(relsDoc, "Relationship").forEach((el) => {
      const id = el.getAttribute("Id");
      const target = el.getAttribute("Target");
      const type = el.getAttribute("Type") ?? "";
      if (id && target && type.endsWith("/slide")) relMap.set(id, normalizeTarget(target));
    });
  }

  let paths: string[] = [];
  if (presentationXml) {
    const doc = parseXml(presentationXml);
    paths = getByLocalName(doc, "sldId")
      .map((el) => el.getAttribute("r:id") ?? el.getAttribute("id") ?? "")
      .map((id) => relMap.get(id))
      .filter((path): path is string => Boolean(path));
  }

  if (paths.length === 0) {
    paths = Object.keys(zip.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0));
  }

  const slides = await Promise.all(
    paths.map(async (path, index) => {
      const xml = await zip.file(path)?.async("text");
      const texts = xml ? extractTexts(xml) : [];
      return { path, name: texts[0] || `Slide ${index + 1}`, texts };
    }),
  );

  return { buffer: changed ? await zip.generateAsync({ type: "arraybuffer" }) : original, slides };
}

function fallbackSlide(meta: SlideMeta | undefined, index: number, width: number, height: number): RenderedSlide {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d4d4d8";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, width - 40, height - 40);
  ctx.fillStyle = "#111827";
  ctx.font = "700 42px Inter, Arial, sans-serif";
  ctx.fillText(meta?.name || `Slide ${index + 1}`, 72, 110, width - 144);
  ctx.font = "26px Inter, Arial, sans-serif";
  ctx.fillStyle = "#374151";
  (meta?.texts ?? []).slice(1, 9).forEach((text, line) => {
    ctx.fillText(text, 88, 180 + line * 48, width - 176);
  });
  return { name: `Slide ${index + 1}`, url: canvas.toDataURL("image/png"), fallback: true };
}

async function waitForImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        img.complete || !img.src
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
    ),
  );
}

/**
 * Renders a .pptx file into individual PNG slide images.
 *
 * Strategy: use pptx-preview in `list` mode + `preview()` (which is more
 * tolerant than renderSingleSlide() to malformed slide layouts). Each slide
 * lands in its own DOM node, which we snapshot via html2canvas.
 */
export async function renderPptxToImages(
  file: File,
  opts: { width?: number; height?: number } = {}
): Promise<RenderedSlide[]> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const prepared = await preparePptx(file);

  if (prepared.slides.length === 0) {
    throw new Error("Nenhum slide encontrado no PowerPoint");
  }

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${width}px`;
  host.style.pointerEvents = "none";
  host.style.background = "#ffffff";
  host.style.zIndex = "-1";
  document.body.appendChild(host);

  try {
    const previewer = init(host, { width, height, mode: "slide" }) as PptxPreviewer;
    let slideCount = prepared.slides.length;
    try {
      const pptx = await previewer.load(prepared.buffer);
      slideCount = Math.max(prepared.slides.length, previewer.slideCount ?? pptx?.slides?.length ?? 0);
    } catch (e) {
      console.warn("pptx-preview: load failed, using simplified slide previews", e);
      return prepared.slides.map((meta, index) => fallbackSlide(meta, index, width, height));
    }

    const out: RenderedSlide[] = [];
    for (let i = 0; i < slideCount; i++) {
      try {
        previewer.renderSingleSlide(i);
        await wait(120);
        const node = host.querySelector<HTMLElement>(`.pptx-preview-slide-wrapper-${i}`);
        if (!node) throw new Error(`Slide ${i + 1} não foi renderizado`);
        await waitForImages(node);

        const rect = node.getBoundingClientRect();
        const captureWidth = Math.ceil(rect.width || node.offsetWidth || width);
        const captureHeight = Math.ceil(rect.height || node.offsetHeight || height);
        const canvas = await html2canvas(node, {
          backgroundColor: "#ffffff",
          scale: 1,
          width: captureWidth,
          height: captureHeight,
          windowWidth: Math.max(captureWidth, width),
          windowHeight: Math.max(captureHeight, height),
          logging: false,
          useCORS: true,
        });
        out.push({ name: `Slide ${i + 1}`, url: canvas.toDataURL("image/png") });
      } catch (e) {
        console.warn(`Slide ${i + 1} render failed, using fallback`, e);
        out.push(fallbackSlide(prepared.slides[i], i, width, height));
      }
    }

    try {
      previewer.destroy?.();
    } catch {
      /* noop */
    }
    return out;
  } finally {
    host.remove();
  }
}
