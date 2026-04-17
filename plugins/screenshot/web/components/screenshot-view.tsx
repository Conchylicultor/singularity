import { useCallback, useEffect, useRef, useState } from "react";
import { ToolsPane, type Tool, type DrawSettings } from "./tools-pane";
import { CropOverlay, type CropRect } from "./crop-overlay";
import { DrawOverlay, type Stroke } from "./draw-overlay";

export function ScreenshotView({ id }: { id: string }) {
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("none");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [draw, setDraw] = useState<DrawSettings>({ color: "#ef4444", width: 4 });

  const reload = useCallback(async () => {
    setError(null);
    // The tab is opened before the upload completes; retry a 404 for a while
    // so the view lights up as soon as the bytes arrive.
    const deadline = Date.now() + 30_000;
    while (true) {
      try {
        const res = await fetch(`/api/screenshots/${id}`);
        if (res.ok) {
          setImageBlob(await res.blob());
          resetEdits();
          return;
        }
        if (res.status !== 404 || Date.now() > deadline) {
          setError(res.status === 404 ? "Screenshot not found" : `Failed (${res.status})`);
          return;
        }
      } catch (err) {
        setError((err as Error).message);
        return;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  function resetEdits() {
    setTool("none");
    setStrokes([]);
  }

  // Switching tools clears tool-local state.
  useEffect(() => {
    if (tool !== "draw") setStrokes([]);
  }, [tool]);

  return (
    <div className="flex h-[calc(100svh-3rem)] min-h-0 w-full overflow-hidden">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/40">
        {error ? (
          <div className="text-sm text-muted-foreground">{error}</div>
        ) : !imageBlob ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ImageStage
            blob={imageBlob}
            tool={tool}
            onCropCommit={async (rect) => {
              const next = await applyCrop(imageBlob, rect);
              setImageBlob(next);
              resetEdits();
            }}
            strokes={strokes}
            onStrokesChange={setStrokes}
            drawSettings={draw}
          />
        )}
      </div>
      <div className="w-72 shrink-0 border-l bg-background">
        <ToolsPane
          tool={tool}
          onToolChange={setTool}
          drawSettings={draw}
          onDrawSettingsChange={setDraw}
          hasStrokes={strokes.length > 0}
          onApplyDraw={async () => {
            if (!imageBlob || strokes.length === 0) return;
            const next = await applyStrokes(imageBlob, strokes);
            setImageBlob(next);
            resetEdits();
          }}
          onClearStrokes={() => setStrokes([])}
          onUndoStroke={() => setStrokes((s) => s.slice(0, -1))}
          onCopy={async () => {
            if (!imageBlob) return;
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": imageBlob }),
            ]);
          }}
          onDownload={() => {
            if (!imageBlob) return;
            const url = URL.createObjectURL(imageBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `screenshot-${id}.png`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          onReset={reload}
        />
      </div>
    </div>
  );
}

interface ImageStageProps {
  blob: Blob;
  tool: Tool;
  onCropCommit: (r: CropRect) => void;
  strokes: Stroke[];
  onStrokesChange: (s: Stroke[] | ((prev: Stroke[]) => Stroke[])) => void;
  drawSettings: DrawSettings;
}

function ImageStage({
  blob,
  tool,
  onCropCommit,
  strokes,
  onStrokesChange,
  drawSettings,
}: ImageStageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [displayedRect, setDisplayedRect] = useState<DOMRect | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  // Track the rendered image rectangle (for mapping pointer events to image px).
  useEffect(() => {
    const measure = () => {
      const img = imgRef.current;
      const container = containerRef.current;
      if (!img || !container) return;
      const containerRect = container.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      // Express relative to the container so overlay positioning is local.
      setDisplayedRect(
        new DOMRect(
          imgRect.left - containerRect.left,
          imgRect.top - containerRect.top,
          imgRect.width,
          imgRect.height,
        ),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    if (imgRef.current) ro.observe(imgRef.current);
    return () => ro.disconnect();
  }, [url, naturalSize]);

  return (
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center p-4">
      {url && (
        <img
          ref={imgRef}
          src={url}
          alt="Screenshot"
          draggable={false}
          className="max-h-full max-w-full object-contain shadow-lg"
          onLoad={(e) => {
            const t = e.currentTarget;
            setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
          }}
        />
      )}
      {tool === "crop" && naturalSize && displayedRect && (
        <CropOverlay
          displayed={displayedRect}
          natural={naturalSize}
          onCommit={onCropCommit}
        />
      )}
      {tool === "draw" && naturalSize && displayedRect && (
        <DrawOverlay
          displayed={displayedRect}
          natural={naturalSize}
          strokes={strokes}
          onStrokesChange={onStrokesChange}
          color={drawSettings.color}
          width={drawSettings.width}
        />
      )}
    </div>
  );
}

async function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Caller is responsible for calling URL.revokeObjectURL — but we keep the
    // image alive here, so revoke after decode (the decoded pixels remain).
    URL.revokeObjectURL(url);
  }
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

async function applyCrop(blob: Blob, crop: CropRect): Promise<Blob> {
  const img = await loadImageElement(blob);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.w));
  canvas.height = Math.max(1, Math.round(crop.h));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
  return canvasToPng(canvas);
}

async function applyStrokes(blob: Blob, strokes: Stroke[]): Promise<Blob> {
  const img = await loadImageElement(blob);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    const first = stroke.points[0]!;
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i]!;
      ctx.lineTo(p.x, p.y);
    }
    if (stroke.points.length === 1) {
      // single dot
      ctx.lineTo(first.x + 0.01, first.y + 0.01);
    }
    ctx.stroke();
  }
  return canvasToPng(canvas);
}
