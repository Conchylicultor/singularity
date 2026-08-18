import { existsSync } from "fs";
import { join } from "path";

/**
 * Which server plugin registry this backend boots, keyed on the namespace name
 * the gateway spawned it with (`SINGULARITY_WORKTREE`):
 *
 *   1. `server.composition.<name>.generated.ts` — a per-name filtered registry:
 *      this namespace is an auto-served composition running from main's
 *      checkout. Absent for a normal git-worktree name — that is NOT an error,
 *      it just falls through.
 *   2. `server.generated.ts` — the full committed registry.
 *
 * EVERY filtered registry is per-name, so selection is keyed on identity alone:
 * no file on disk can reconfigure a namespace other than the one it names. The
 * pre-S1 checkout-global `server.composition.generated.ts` fallback was removed
 * in S5 (`research/2026-08-06-global-one-dist-per-namespace.md`) — a stray file
 * of that name is now inert rather than poisonous.
 *
 * Split out of `plugins-active.ts` so the chain is a pure `(coreDir, name) =>
 * path` function with a test. Importing `plugins-active.ts` to exercise it would
 * load every server plugin as a side effect.
 *
 * @param coreDir the `server-core/core` directory holding the registries
 * @param name the raw `SINGULARITY_WORKTREE` value (absent/empty ⇒ full registry)
 */
export function selectRegistry(
  coreDir: string,
  name: string | undefined,
): string {
  if (name !== undefined && name !== "") {
    // Same charset as the gateway's namespace regex (gateway/registry.go). A
    // mismatch means a broken spawn env, not a missing registry — fail loudly
    // rather than silently booting the full registry under a bogus identity.
    // KEEP IN SYNC with the canonical TS copy, COMPOSITION_NAME_RE in
    // plugin-meta/composition/core/namespace.ts — boot cannot import config_v2,
    // which that module's barrel pulls in.
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) {
      throw new Error(
        `Invalid SINGULARITY_WORKTREE "${name}" — cannot select a plugin registry.`,
      );
    }
    const perName = join(coreDir, `server.composition.${name}.generated.ts`);
    if (existsSync(perName)) return perName;
  }
  return join(coreDir, "server.generated.ts");
}
