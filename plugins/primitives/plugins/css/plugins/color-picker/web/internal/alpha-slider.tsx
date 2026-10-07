import { Layer } from "@plugins/primitives/plugins/css/plugins/layer/web";
import type { Color } from "../../core";
import { SliderTrack } from "./slider-track";

export interface AlphaSliderProps {
  color: Color;
  alpha: number;
  onChange: (alpha: number) => void;
  /** A drag released, or an arrow key let go. */
  onCommit?: () => void;
  className?: string;
}

const CHECKERBOARD = {
  backgroundImage: [
    "linear-gradient(45deg, #ccc 25%, transparent 25%)",
    "linear-gradient(-45deg, #ccc 25%, transparent 25%)",
    "linear-gradient(45deg, transparent 75%, #ccc 75%)",
    "linear-gradient(-45deg, transparent 75%, #ccc 75%)",
  ].join(", "),
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
};

/** Opacity, 0..1, over a checkerboard; the thumb shows the color at that opacity. */
export function AlphaSlider({
  color,
  alpha,
  onChange,
  onCommit,
  className,
}: AlphaSliderProps) {
  const opaque = color.withAlpha(1).toOklch();
  const step = (d: 1 | -1, big: boolean) =>
    onChange(Math.max(0, Math.min(1, alpha + d * (big ? 0.1 : 0.01))));

  return (
    <SliderTrack
      position={alpha}
      onDrag={onChange}
      onStep={step}
      onCommit={onCommit}
      label="Opacity"
      valueNow={Math.round(alpha * 100)}
      valueMin={0}
      valueMax={100}
      valueText={`${Math.round(alpha * 100)}%`}
      thumbFill={color.withAlpha(alpha).toOklch()}
      background={CHECKERBOARD}
      overlay={
        <Layer
          decorative
          className="rounded-full"
          style={{
            background: `linear-gradient(to right, transparent, ${opaque})`,
          }}
        />
      }
      className={className}
    />
  );
}
