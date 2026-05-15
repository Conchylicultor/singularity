import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { Color } from "./color";
import { ColorArea } from "./color-area";
import { HueSlider } from "./hue-slider";
import { AlphaSlider } from "./alpha-slider";
import { ColorInput } from "./color-input";
import { SwatchGrid } from "./swatch-grid";

export interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  swatches?: string[];
  showAlpha?: boolean;
  className?: string;
}

export function ColorPicker({
  value,
  onChange,
  swatches,
  showAlpha = false,
  className,
}: ColorPickerProps) {
  const lastEmitted = useRef(value);
  const [color, setColor] = useState(() => Color.fromCss(value) ?? Color.fromHex("#3b82f6"));

  useEffect(() => {
    if (value !== lastEmitted.current) {
      const parsed = Color.fromCss(value);
      if (parsed && !parsed.equals(color)) {
        setColor(parsed);
      }
      lastEmitted.current = value;
    }
  }, [value, color]);

  const emit = useCallback(
    (next: Color) => {
      setColor(next);
      const hex = next.toHex();
      lastEmitted.current = hex;
      onChange(hex);
    },
    [onChange],
  );

  return (
    <div className={cn("flex w-56 flex-col gap-2 p-2", className)}>
      {swatches && swatches.length > 0 && (
        <div>
          <SectionLabel className="px-0.5 pb-1.5 text-[10px]">Swatches</SectionLabel>
          <SwatchGrid
            colors={swatches}
            value={value}
            onChange={(c) => {
              const parsed = Color.fromCss(c);
              if (parsed) emit(parsed);
            }}
          />
        </div>
      )}

      <ColorArea
        hue={color.h}
        lightness={color.l}
        chroma={color.c}
        onChange={(l, c) => emit(Color.fromOklch(l, c, color.h, color.alpha))}
      />

      <HueSlider value={color.h} onChange={(h) => emit(color.withHue(h))} />

      {showAlpha && (
        <AlphaSlider
          color={color}
          alpha={color.alpha}
          onChange={(a) => emit(color.withAlpha(a))}
        />
      )}

      <ColorInput color={color} onChange={emit} />
    </div>
  );
}
