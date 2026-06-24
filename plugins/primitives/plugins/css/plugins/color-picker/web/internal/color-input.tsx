import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState, useCallback } from "react";
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
  // The text-input `draft` state is re-initialized from the canonical color by
  // remounting the editable field whenever the color or format changes (the key
  // below), instead of mirroring `color`/`format` into state via an effect.
  // `commit()` already fires `onChange` synchronously on blur/Enter before the
  // parent color updates, so no in-progress edit is lost across the remount.
  return (
    <ColorInputField
      key={`${color.toOklch()}:${format}`}
      color={color}
      format={format}
      onChange={onChange}
      onCycleFormat={() => {
        const idx = FORMATS.indexOf(format);
        setFormat(FORMATS[(idx + 1) % FORMATS.length]!);
      }}
      className={className}
    />
  );
}

function ColorInputField({
  color,
  format,
  onChange,
  onCycleFormat,
  className,
}: {
  color: Color;
  format: ColorFormat;
  onChange: (color: Color) => void;
  onCycleFormat: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => colorToString(color, format));

  const commit = useCallback(() => {
    const parsed = Color.fromCss(draft);
    if (parsed) {
      onChange(parsed);
    } else {
      setDraft(colorToString(color, format));
    }
  }, [draft, color, format, onChange]);

  return (
    <div className={cn("flex items-center gap-sm", className)}>
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
        className="w-full rounded-md border border-input bg-background px-sm py-xs font-mono text-caption outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={onCycleFormat}
        className="w-9 shrink-0 text-center text-3xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground cursor-pointer select-none"
      >
        {FORMAT_LABELS[format]}
      </button>
    </div>
  );
}
