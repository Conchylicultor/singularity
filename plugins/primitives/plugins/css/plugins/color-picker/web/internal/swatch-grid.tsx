import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { Color } from "./color";

export interface SwatchGridProps {
  colors: string[];
  value?: string;
  onChange: (color: string) => void;
  className?: string;
  /**
   * Optional display transform: maps a swatch's canonical color to the CSS
   * actually painted in its cell. `value` matching and `onChange` still operate
   * on the canonical color — only the rendered background changes. Lets a
   * consumer show a derived shade (e.g. Sonata's black-key color) while keeping
   * the stored/selected value the base color.
   */
  renderColor?: (color: string) => string;
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
  renderColor,
}: SwatchGridProps) {
  return (
    <div className={cn("flex flex-wrap gap-xs", className)}>
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
            style={{ background: renderColor ? renderColor(c) : c }}
          />
        );
      })}
    </div>
  );
}
