import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { worktreesDir } from "./worktree-op";

export interface WorktreeSpec {
  /** Namespace = subdomain = SINGULARITY_WORKTREE. Spec dir basename. */
  name: string;
  /** Absolute path to the backend working dir (`bun bin/index.ts` runs here). */
  server: string;
  /** Absolute path to web/dist. Omitted for API-only namespaces (central). */
  web?: string;
  /**
   * Explicit backend spawn argv (e.g. `["<abs>/server"]` for a compiled
   * release). Omitted for dev, where the gateway falls back to its
   * `bun bin/index.ts` convention. On-disk JSON key is exactly `command`
   * (the Go gateway reads it via `json:"command"`).
   */
  command?: string[];
}

/**
 * Register a servable namespace by writing its `spec.json`. The gateway's
 * fsnotify watcher picks it up; identity flows from the dir basename to the
 * backend's `SINGULARITY_WORKTREE` env var. Returns the spec.json path.
 *
 * This is the single seam shared by the dev build (identity derived from the git
 * worktree) and the release launcher (a fixed name, no git operation). The spec
 * is pure identity — composition filtering is baked into the `server`/`web`
 * trees the spec points at (a present `server.composition.generated.ts` selects
 * the filtered server), never carried here.
 */
export function writeWorktreeSpec({
  name,
  server,
  web,
  command,
}: WorktreeSpec): string {
  const dir = join(worktreesDir(), name);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "spec.json");
  // Build the spec object additively so absent keys are omitted entirely —
  // a dev spec must serialize byte-for-byte as before (no `web`/`command`
  // when unset), since the gateway treats a missing `command` as "use the
  // bun bin/index.ts convention".
  const spec: { server: string; web?: string; command?: string[] } = { server };
  if (web) spec.web = web;
  if (command) spec.command = command;
  writeFileSync(path, JSON.stringify(spec, null, 2) + "\n");
  return path;
}
