import type { RailFramingProps } from "@plugins/apps/core";
import { AppRail } from "@plugins/apps/web";

/**
 * The default rail: a 2.5rem icon rail beside the app content. Sets
 * `--app-rail-width` (the rail's own width, read by AppRail) and places the
 * rail as a flex sibling of `body`, so the body starts after the rail. The app
 * shell's sidebar — fixed but bounded to `body` — pins to `body`'s left edge
 * with no extra offset. Pixel-identical to the pre-region app rail.
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
