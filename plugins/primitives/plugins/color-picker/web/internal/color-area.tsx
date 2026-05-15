import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Color, MAX_CHROMA } from "./color";
import { useColorDrag } from "./use-color-drag";

export interface ColorAreaProps {
  hue: number;
  lightness: number;
  chroma: number;
  onChange: (l: number, c: number) => void;
  className?: string;
}

const CANVAS_SIZE = 64;

function renderGradient(
  canvas: HTMLCanvasElement,
  hue: number,
) {
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(CANVAS_SIZE, CANVAS_SIZE);
  const data = img.data;

  for (let y = 0; y < CANVAS_SIZE; y++) {
    const l = 1 - y / (CANVAS_SIZE - 1);
    for (let x = 0; x < CANVAS_SIZE; x++) {
      const c = (x / (CANVAS_SIZE - 1)) * MAX_CHROMA;
      const [r, g, b] = Color.fromOklch(l, c, hue).toSrgb();
      const i = (y * CANVAS_SIZE + x) * 4;
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}

export function ColorArea({
  hue,
  lightness,
  chroma,
  onChange,
  className,
}: ColorAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) renderGradient(canvas, hue);
  }, [hue]);

  const { onPointerDown } = useColorDrag(containerRef, (x, y) => {
    onChange(1 - y, x * MAX_CHROMA);
  });

  const thumbX = `${(chroma / MAX_CHROMA) * 100}%`;
  const thumbY = `${(1 - lightness) * 100}%`;

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      className={cn("relative aspect-square cursor-crosshair rounded-md overflow-hidden", className)}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full"
        style={{ imageRendering: "auto" }}
      />
      <div
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black/30"
        style={{ left: thumbX, top: thumbY }}
      />
    </div>
  );
}
