import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useRef } from "react";
import type { Color } from "./color";
import { useColorDrag } from "./use-color-drag";

export interface AlphaSliderProps {
  color: Color;
  alpha: number;
  onChange: (alpha: number) => void;
  className?: string;
}

const CHECKERBOARD = [
  "linear-gradient(45deg, #ccc 25%, transparent 25%)",
  "linear-gradient(-45deg, #ccc 25%, transparent 25%)",
  "linear-gradient(45deg, transparent 75%, #ccc 75%)",
  "linear-gradient(-45deg, transparent 75%, #ccc 75%)",
].join(", ");

export function AlphaSlider({
  color,
  alpha,
  onChange,
  className,
}: AlphaSliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { onPointerDown } = useColorDrag(ref, (x) => {
    onChange(x);
  });

  const opaque = color.withAlpha(1).toOklch();

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      className={cn("relative h-4 cursor-pointer rounded-full", className)}
      style={{
        backgroundImage: CHECKERBOARD,
        backgroundSize: "8px 8px",
        backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
      }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `linear-gradient(to right, transparent, ${opaque})`,
        }}
      />
      <div
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black/30"
        style={{ left: `${alpha * 100}%` }}
      />
    </div>
  );
}
