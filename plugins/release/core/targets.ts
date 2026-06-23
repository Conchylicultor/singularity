// The "release" log channel id. Exposed in `core/` (not buried in `server/`) so
// the UI can subscribe to the live `/ws/logs` stream by name without hardcoding
// the string — both runtimes import this one constant.
export const RELEASE_LOG_CHANNEL = "release";

/**
 * A release target — a single, closed-list entry both runtimes need: the web
 * picker enumerates them, the server validates against them and builds the CLI
 * args from them. This is the textbook case for `core/` (shared cross-runtime
 * data) rather than a slot — see the plan's §1 / the web-sdk "Sharing code
 * between web and server" doc. The icon stays web-only (the server must not
 * import a UI component); the web launcher decorates by id.
 */
export interface ReleaseTarget {
  id: string; // "web" | "tauri"
  label: string; // "Web"
  implemented: boolean; // false ⇒ greyed "coming soon"
  buildArgs: (composition: string) => string[]; // UI choice → CLI flags
}

// Single source of truth for the release target set. Adding `tauri` (F5) is one
// line here — both the web picker and the server validator pick it up with zero
// consumer changes.
export const RELEASE_TARGETS: ReleaseTarget[] = [
  { id: "web", label: "Web", implemented: true, buildArgs: () => ["--target", "web"] },
];

export const releaseTargetById = (id: string): ReleaseTarget | undefined =>
  RELEASE_TARGETS.find((t) => t.id === id);
