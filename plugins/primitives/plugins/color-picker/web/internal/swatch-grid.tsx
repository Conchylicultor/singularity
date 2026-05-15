import { cn } from "@/lib/utils";
import { Color } from "./color";

export interface SwatchGridProps {
  colors: string[];
  value?: string;
  onChange: (color: string) => void;
  className?: string;
}

function normalize(css: string): string {
  return Color.fromCss(css)?.toHex() ?? css.toLowerCase();
}

export function SwatchGrid({
  colors,
  value,
  onChange,
  className,
}: SwatchGridProps) {
  const normalizedValue = value != null ? normalize(value) : null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {colors.map((c) => {
        const selected = normalizedValue === normalize(c);
        return (
          <button
            key={c}
            type="button"
            aria-label={c}
            aria-pressed={selected}
            onClick={() => onChange(c)}
            className={cn(
              "size-5 rounded-full border border-border transition-transform",
              selected &&
                "scale-110 ring-2 ring-ring ring-offset-1 ring-offset-background",
            )}
            style={{ background: c }}
          />
        );
      })}
    </div>
  );
}
