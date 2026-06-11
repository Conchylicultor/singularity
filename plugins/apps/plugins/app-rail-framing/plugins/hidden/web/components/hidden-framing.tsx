import type { RailFramingProps } from "@plugins/apps/core";

/**
 * Hidden rail: no app switcher. Drives `--app-rail-width: 0px` so the sidebar
 * slides flush to the viewport edge (sidebar.tsx's `,0px` fallback handles the
 * offset). Re-show the rail from the theme customizer's "App rail" picker.
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
