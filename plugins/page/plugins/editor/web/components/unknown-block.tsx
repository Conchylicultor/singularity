import type { BlockRendererProps } from "../types";

export function UnknownBlock({ block }: BlockRendererProps) {
  return (
    <div className="px-3 py-1 text-xs text-muted-foreground font-mono">
      Unknown block: {block.type}
    </div>
  );
}
