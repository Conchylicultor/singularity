import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useRef } from "react";
import { useColorDrag } from "./use-color-drag";

export interface HueSliderProps {
  value: number;
  onChange: (hue: number) => void;
  className?: string;
}

const HUE_GRADIENT = [
  "oklch(0.65 0.25 0)",
  "oklch(0.65 0.25 60)",
  "oklch(0.65 0.25 120)",
  "oklch(0.65 0.25 180)",
  "oklch(0.65 0.25 240)",
  "oklch(0.65 0.25 300)",
  "oklch(0.65 0.25 360)",
].join(", ");

export function HueSlider({ value, onChange, className }: HueSliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { onPointerDown } = useColorDrag(ref, (x) => {
    onChange(x * 360);
  });

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      className={cn("relative h-4 cursor-pointer rounded-full", className)}
      style={{ background: `linear-gradient(to right, ${HUE_GRADIENT})` }}
    >
      <div
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ring-1 ring-black/30"
        style={{ left: `${(value / 360) * 100}%` }}
      />
    </div>
  );
}
