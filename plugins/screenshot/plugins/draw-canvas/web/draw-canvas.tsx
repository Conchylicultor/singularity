import { useEffect, useRef, useState } from "react";

export interface Stroke {
  color: string;
  width: number;
  /** Points expressed in image natural pixels. */
  points: { x: number; y: number }[];
}

export interface DrawCanvasProps {
  displayed: DOMRect;
  natural: { w: number; h: number };
  strokes: Stroke[];
  onStrokesChange: (s: Stroke[] | ((prev: Stroke[]) => Stroke[])) => void;
  color: string;
  width: number;
  readOnly?: boolean;
}

export function DrawCanvas({
  displayed,
  natural,
  strokes,
  onStrokesChange,
  color,
  width,
  readOnly = false,
}: DrawCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);

  const scaleX = natural.w / displayed.width;
  const scaleY = natural.h / displayed.height;

  // Repaint whenever strokes / size change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(displayed.width * dpr));
    canvas.height = Math.max(1, Math.floor(displayed.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.clearRect(0, 0, displayed.width, displayed.height);
    for (const stroke of strokes) {
      if (stroke.points.length === 0) continue;
      ctx.strokeStyle = stroke.color;
      // Convert image-pixel width to displayed-pixel width.
      ctx.lineWidth = stroke.width / scaleX;
      ctx.beginPath();
      const first = stroke.points[0]!;
      ctx.moveTo(first.x / scaleX, first.y / scaleY);
      for (let i = 1; i < stroke.points.length; i++) {
        const p = stroke.points[i]!;
        ctx.lineTo(p.x / scaleX, p.y / scaleY);
      }
      if (stroke.points.length === 1) {
        ctx.lineTo(first.x / scaleX + 0.01, first.y / scaleY + 0.01);
      }
      ctx.stroke();
    }
  }, [strokes, displayed.width, displayed.height, scaleX, scaleY]);

  function localPoint(e: React.PointerEvent): { x: number; y: number } {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * scaleX,
      y: (e.clientY - r.top) * scaleY,
    };
  }

  return (
    <canvas
      ref={canvasRef}
      // eslint-disable-next-line layout/no-adhoc-layout -- canvas positioned by JS/pixel coordinates from the displayed DOMRect
      className="absolute touch-none"
      style={{
        left: displayed.x,
        top: displayed.y,
        width: displayed.width,
        height: displayed.height,
        cursor: readOnly ? "default" : "crosshair",
        pointerEvents: readOnly ? "none" : "auto",
      }}
      onPointerDown={(e) => {
        if (readOnly) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrawing(true);
        const p = localPoint(e);
        onStrokesChange((prev) => [
          ...prev,
          { color, width, points: [p] },
        ]);
      }}
      onPointerMove={(e) => {
        if (!drawing) return;
        const p = localPoint(e);
        onStrokesChange((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1]!;
          const updated = { ...last, points: [...last.points, p] };
          return [...prev.slice(0, -1), updated];
        });
      }}
      onPointerUp={() => setDrawing(false)}
      onPointerCancel={() => setDrawing(false)}
    />
  );
}
