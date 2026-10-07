import { SliderTrack } from "./slider-track";

export interface HueSliderProps {
  value: number;
  onChange: (hue: number) => void;
  /** A drag released, or an arrow key let go. */
  onCommit?: () => void;
  className?: string;
}

const HUE_GRADIENT = [
  "oklch(0.7 0.16 0)",
  "oklch(0.7 0.16 60)",
  "oklch(0.7 0.16 120)",
  "oklch(0.7 0.16 180)",
  "oklch(0.7 0.16 240)",
  "oklch(0.7 0.16 300)",
  "oklch(0.7 0.16 360)",
].join(", ");

const TRACK = { background: `linear-gradient(to right, ${HUE_GRADIENT})` };

/** The OKLCH hue, 0..360°. The thumb shows the hue at the track's own lightness and chroma. */
export function HueSlider({
  value,
  onChange,
  onCommit,
  className,
}: HueSliderProps) {
  return (
    <SliderTrack
      position={value / 360}
      // 359.9, not 360: the far end stays at the far end instead of wrapping to 0.
      onDrag={(x) => onChange(Math.min(x * 360, 359.9))}
      onStep={(d, big) => onChange((value + d * (big ? 10 : 1) + 360) % 360)}
      onCommit={onCommit}
      label="Hue"
      valueNow={Math.round(value)}
      valueMin={0}
      valueMax={360}
      valueText={`${Math.round(value)}°`}
      thumbFill={`oklch(0.7 0.16 ${value})`}
      background={TRACK}
      className={className}
    />
  );
}
