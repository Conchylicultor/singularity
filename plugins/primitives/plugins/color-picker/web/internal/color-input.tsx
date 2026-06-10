import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { Color } from "./color";

type ColorFormat = "hex" | "oklch" | "hsl";
const FORMATS: ColorFormat[] = ["hex", "oklch", "hsl"];
const FORMAT_LABELS: Record<ColorFormat, string> = { hex: "HEX", oklch: "OKLCH", hsl: "HSL" };

function colorToString(color: Color, fmt: ColorFormat): string {
  if (fmt === "oklch") return color.toOklch();
  if (fmt === "hsl") return color.toHsl();
  return color.toHex();
}

export interface ColorInputProps {
  color: Color;
  onChange: (color: Color) => void;
  className?: string;
}

export function ColorInput({ color, onChange, className }: ColorInputProps) {
  const [format, setFormat] = useDraft<ColorFormat>("color-picker-format", "hex", { ttl: 365 * 24 * 60 * 60 * 1000 });
  const [draft, setDraft] = useState(() => colorToString(color, format));

  useEffect(() => {
    setDraft(colorToString(color, format));
  }, [color, format]);

  const commit = useCallback(() => {
    const parsed = Color.fromCss(draft);
    if (parsed) {
      onChange(parsed);
    } else {
      setDraft(colorToString(color, format));
    }
  }, [draft, color, format, onChange]);

  const cycleFormat = useCallback(() => {
    const idx = FORMATS.indexOf(format);
    setFormat(FORMATS[(idx + 1) % FORMATS.length]!);
  }, [format, setFormat]);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className="size-5 shrink-0 rounded-md border border-border"
        style={{ background: color.toOklch() }}
      />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className="w-full rounded-md border border-input bg-background px-2 py-1 font-mono text-caption outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={cycleFormat}
        className="w-9 shrink-0 text-center text-3xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer select-none"
      >
        {FORMAT_LABELS[format]}
      </button>
    </div>
  );
}
