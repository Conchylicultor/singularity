import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { Color } from "./color";

export interface SwatchGridProps {
  colors: string[];
  value?: string;
  onChange: (color: string) => void;
  className?: string;
}

function colorsMatch(a: string, b: string): boolean {
  const ca = Color.fromCss(a);
  const cb = Color.fromCss(b);
  if (!ca || !cb) return a.toLowerCase() === b.toLowerCase();
  return ca.equals(cb);
}

export function SwatchGrid({
  colors,
  value,
  onChange,
  className,
}: SwatchGridProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {colors.map((c) => {
        const selected = value != null && colorsMatch(value, c);
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
