import type { RailFramingProps } from "@plugins/apps/core";
import { AppRail } from "@plugins/apps/web";

/**
 * The default rail: a 2.5rem icon rail beside the app content. Sets
 * `--app-rail-width` (the single source of truth the sidebar reads for its
 * offset and AppRail reads for its own width). Pixel-identical to the
 * pre-region app rail.
 */
export function RailFraming({ body }: RailFramingProps) {
  return (
    <div
      className="flex h-full min-h-0"
      style={{ "--app-rail-width": "2.5rem" } as React.CSSProperties}
    >
      <AppRail />
      {body}
    </div>
  );
}
