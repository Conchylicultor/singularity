// Composition-namespace provenance + collision guard. A compose-served
// composition owns a namespace dir under `worktrees/<id>/` only if it carries
// our `composition.json` marker — the decisive "this is a compose-serve
// namespace, not main and not a real git worktree" signal. Single-sourced here
// (rather than inside the CLI bin) so both the build-time compose-serve stage
// and the runtime reset endpoint consume the exact same safety-critical logic;
// a marker-name or collision-rule change can never drift between the two.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { worktreesDir } from "./worktree-op";

export const COMPOSITION_MARKER_FILE = "composition.json";

export interface CompositionMarker {
  composition: string;
  builtAt: string;
  buildId: string;
}

export interface NamespaceProbe {
  specDirExists: boolean;
  hasCompositionMarker: boolean;
  gitWorktreeDirExists: boolean;
  branchExists: boolean;
}

/**
 * Refuse to claim a namespace another owner already holds. A composition dir is
 * ours only if it carries our `composition.json` marker; a same-named git
 * worktree or branch would collide the moment that worktree builds.
 */
export function namespaceCollision(id: string, probe: NamespaceProbe): string | null {
  if (probe.gitWorktreeDirExists) {
    return `a git worktree checkout named "${id}" exists under .claude/worktrees/ — rename the composition.`;
  }
  if (probe.branchExists) {
    return `a git branch named "${id}" exists — its worktree would collide with this namespace; rename the composition.`;
  }
  if (probe.specDirExists && !probe.hasCompositionMarker) {
    return (
      `the worktrees-registry dir for "${id}" exists WITHOUT a ${COMPOSITION_MARKER_FILE} marker — ` +
      `it belongs to a git worktree or foreign namespace; refusing to overwrite.`
    );
  }
  return null;
}

function branchExists(root: string, name: string): boolean {
  const proc = Bun.spawnSync(
    ["git", "show-ref", "--verify", "--quiet", `refs/heads/${name}`],
    { cwd: root, stdout: "ignore", stderr: "ignore" },
  );
  return proc.exitCode === 0;
}

export function probeNamespace(root: string, id: string): NamespaceProbe {
  const specDir = join(worktreesDir(), id);
  return {
    specDirExists: existsSync(specDir),
    hasCompositionMarker: existsSync(join(specDir, COMPOSITION_MARKER_FILE)),
    gitWorktreeDirExists: existsSync(join(root, ".claude", "worktrees", id)),
    branchExists: branchExists(root, id),
  };
}

/** True when `worktrees/<id>/composition.json` exists — the namespace is compose-serve-owned. */
export function hasCompositionMarker(id: string): boolean {
  return existsSync(join(worktreesDir(), id, COMPOSITION_MARKER_FILE));
}

/**
 * Read the provenance marker for a compose-serve namespace. Returns the parsed
 * marker, or `null` when the namespace carries no `composition.json` (not
 * compose-serve-owned).
 */
export function readCompositionMarker(id: string): CompositionMarker | null {
  const path = join(worktreesDir(), id, COMPOSITION_MARKER_FILE);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as CompositionMarker;
}
