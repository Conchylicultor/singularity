/**
 * The three ways a composition releases. A closed, fully-enumerable list —
 * plain data in `core/` (per the enumerable-closed-list rule; mirrors
 * `downloads/core/downloads.ts`), shared by the landing release-switcher demo
 * and the platform pyramid's top tier so the two stay in lockstep.
 */
export type ReleaseTargetId = "desktop" | "web" | "workspace";

export interface ReleaseTarget {
  id: ReleaseTargetId;
  /** Switcher / chip label. */
  label: string;
  /** One-line caption shown under the demo frame for this target. */
  tagline: string;
}

export const RELEASE_TARGETS: readonly ReleaseTarget[] = [
  {
    id: "desktop",
    label: "Desktop app",
    tagline:
      "A standalone native app — the same composition wrapped in its own window.",
  },
  {
    id: "web",
    label: "Web app",
    tagline: "A standalone web app — one URL, nothing to install.",
  },
  {
    id: "workspace",
    label: "In the workspace",
    tagline:
      "A window inside the equin desktop, alongside every other app.",
  },
];
