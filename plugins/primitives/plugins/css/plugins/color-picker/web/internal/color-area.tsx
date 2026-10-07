import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Layer } from "@plugins/primitives/plugins/css/plugins/layer/web";
import { useRef, useEffect } from "react";
import { Color, maxChroma } from "../../core";
import { Thumb } from "./slider-track";
import { useColorDrag } from "./use-color-drag";

export interface ColorAreaProps {
  hue: number;
  lightness: number;
  chroma: number;
  onChange: (l: number, c: number) => void;
  /** A drag released, or an arrow key let go. */
  onCommit?: () => void;
  className?: string;
}

const CANVAS_W = 96;
const CANVAS_H = 66;

/**
 * A row's chroma span, never 0 — black and white rows have (almost) nothing to
 * give, and a 0 would divide the thumb position by zero.
 */
function rowEdge(l: number, h: number): number {
  return Math.max(maxChroma(l, h), 1e-6);
}

/**
 * Paint the fitted square: each row is one lightness, stretched from grey to
 * that row's own sRGB edge, so every pixel is a color a screen really shows.
 */
function renderGradient(canvas: HTMLCanvasElement, hue: number) {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ColorArea: canvas has no 2d context");
  const img = ctx.createImageData(CANVAS_W, CANVAS_H);
  const data = img.data;

  for (let y = 0; y < CANVAS_H; y++) {
    const l = 1 - y / (CANVAS_H - 1);
    const edge = maxChroma(l, hue);
    for (let x = 0; x < CANVAS_W; x++) {
      const c = (x / (CANVAS_W - 1)) * edge;
      const [r, g, b] = Color.fromOklch(l, c, hue).toSrgb();
      const i = (y * CANVAS_W + x) * 4;
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}

const LIGHTNESS_KEYS: Record<string, number> = { ArrowUp: 1, ArrowDown: -1 };
const CHROMA_KEYS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

/**
 * Lightness (y) × chroma (x) at one hue, FITTED (Okhsv-style): x is the
 * fraction of the row's own displayable maximum, so the whole square is in
 * gamut and a drag can never store a color the screen would clip.
 */
export function ColorArea({
  hue,
  lightness,
  chroma,
  onChange,
  onCommit,
  className,
}: ColorAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) renderGradient(canvas, hue);
  }, [hue]);

  const { onPointerDown } = useColorDrag(
    containerRef,
    (x, y) => {
      const l = 1 - y;
      onChange(l, x * rowEdge(l, hue));
    },
    onCommit,
  );

  const thumbX = Math.min(1, chroma / rowEdge(lightness, hue));
  const fill = Color.fromOklch(lightness, chroma, hue).toOklch();

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Lightness and chroma"
      aria-valuenow={Math.round(lightness * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`lightness ${Math.round(lightness * 100)}%, chroma ${chroma.toFixed(3)}`}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        const dl = LIGHTNESS_KEYS[e.key];
        const dc = CHROMA_KEYS[e.key];
        if (dl === undefined && dc === undefined) return;
        e.preventDefault();
        const k = e.shiftKey ? 10 : 1;
        const l = Math.max(0, Math.min(1, lightness + (dl ?? 0) * 0.01 * k));
        const c = Math.max(0, chroma + (dc ?? 0) * 0.004 * k);
        onChange(l, Math.min(c, maxChroma(l, hue)));
      }}
      onKeyUp={(e) => {
        if (
          LIGHTNESS_KEYS[e.key] !== undefined ||
          CHROMA_KEYS[e.key] !== undefined
        ) {
          onCommit?.();
        }
      }}
      className={cn(
        "relative aspect-[16/11] cursor-crosshair touch-none rounded-md outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        className,
      )}
    >
      <Layer
        as="canvas"
        ref={canvasRef}
        decorative
        className="size-full rounded-md"
      />
      <Thumb x={thumbX} y={1 - lightness} fill={fill} />
    </div>
  );
}
