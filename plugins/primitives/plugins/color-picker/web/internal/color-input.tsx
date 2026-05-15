import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Color } from "./color";

export interface ColorInputProps {
  color: Color;
  onChange: (color: Color) => void;
  className?: string;
}

export function ColorInput({ color, onChange, className }: ColorInputProps) {
  const [draft, setDraft] = useState(() => color.toHex());

  useEffect(() => {
    setDraft(color.toHex());
  }, [color]);

  const commit = useCallback(() => {
    const parsed = Color.fromCss(draft);
    if (parsed) {
      onChange(parsed);
    } else {
      setDraft(color.toHex());
    }
  }, [draft, color, onChange]);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className="size-5 shrink-0 rounded border border-border"
        style={{ background: color.toHex() }}
      />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className="w-full rounded-md border border-input bg-background px-2 py-1 font-mono text-xs outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
        spellCheck={false}
      />
    </div>
  );
}
