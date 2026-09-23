import type { ReactElement, ReactNode } from "react";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";

/**
 * The frame-source dispatch fallback: a frame names a source nothing contributes
 * (its plugin was removed while the frame was on the canvas). Rendered through
 * the same `children(resolution)` path as a real source, so the frame's chrome
 * is the same — only the sentence differs.
 *
 * Its props are spelled out rather than imported from `slots.ts`, which imports
 * this file: the reverse import would be a cycle.
 */
export function UnknownFrameSource({
  source,
  children,
}: {
  source: string;
  meta: PrototypeMeta;
  children: (resolution: {
    status: "unresolved";
    title: ReactNode;
    detail: ReactNode;
  }) => ReactNode;
}): ReactElement {
  return (
    <>
      {children({
        status: "unresolved",
        title: `Nothing in this worktree shows “${source}” frames.`,
        detail:
          "The plugin that added this frame is not loaded here. Close the frame.",
      })}
    </>
  );
}
