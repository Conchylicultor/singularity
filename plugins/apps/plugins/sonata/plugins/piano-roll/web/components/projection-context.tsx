import { createContext, useContext, type ReactNode } from "react";
import type {
  Projection,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * The piano roll publishes its `Projection` via this OWN React context (NOT the
 * shell's) so capability-compatible overlays — which `renderIsolated` mounts as
 * children of the note grid — can read the exact geometry the roll draws with.
 *
 * The piano roll offers BOTH capabilities (`"time-axis"` + `"pitch-plane"`), so
 * the published projection carries real `beatToY` / `pitchToX` / `noteToRect`.
 */
const ProjectionContext = createContext<Projection | null>(null);

/**
 * Read the piano roll's published projection. Throws outside the roll's grid so
 * an overlay can never silently anchor against a missing geometry (fail loudly).
 */
export function useProjection(): Projection {
  const ctx = useContext(ProjectionContext);
  if (!ctx) {
    throw new Error("useProjection must be used within the piano roll grid");
  }
  return ctx;
}

export function ProjectionProvider({
  projection,
  children,
}: {
  projection: Projection;
  children: ReactNode;
}) {
  return (
    <ProjectionContext.Provider value={projection}>
      {children}
    </ProjectionContext.Provider>
  );
}
