import type { RailFramingProps } from "@plugins/apps/core";

/**
 * Hidden rail: no app switcher. No rail sibling, so `body` (and the sidebar
 * bounded to it) fills the full width flush to the viewport edge; the
 * `--app-rail-width: 0px` keeps the rail-width var consistent for any reader.
 * Re-show the rail from the theme customizer's "App rail" picker.
 */
export function HiddenFraming({ body }: RailFramingProps) {
  return (
    <div
      className="flex h-full min-h-0"
      style={{ "--app-rail-width": "0px" } as React.CSSProperties}
    >
      {body}
    </div>
  );
}
