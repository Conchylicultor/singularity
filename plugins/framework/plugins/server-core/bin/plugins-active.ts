import { existsSync } from "fs";
import { join } from "path";

// Registry selection chain, keyed on the namespace name the gateway spawned us
// with (SINGULARITY_WORKTREE):
//
//   1. `server.composition.<name>.generated.ts` — a per-name filtered registry:
//      this namespace is an auto-served composition running from main's
//      checkout. Absent for a normal git-worktree name — that is NOT an error,
//      it just falls through.
//   2. `server.composition.generated.ts` — LEGACY singleton. Nothing produces
//      this spelling any more: every filtered registry is per-name (step 1),
//      including `build-composition` / release. It is retained ONLY as the
//      drain path for a pre-S1 checkout that still carries one, which a plain
//      `build` reaps via `clearCompositionRegistries`. Delete this branch (and
//      the reaper) in S5, once every active checkout has run one post-S1 build.
//      See research/2026-08-06-global-one-dist-per-namespace.md.
//   3. `server.generated.ts` — the full committed registry.
//
// All composition registries are gitignored, so the specifier is held in a
// variable (never a string literal pointing at a maybe-absent file) — tsc must
// not try to resolve the gitignored modules. Bun runs this unbundled, so the
// guarded dynamic import loads only the branch taken.
const coreDir = join(import.meta.dir, "../core");

function selectRegistry(): string {
  const name = process.env.SINGULARITY_WORKTREE;
  if (name !== undefined && name !== "") {
    // Same charset as the gateway's namespace regex (gateway/registry.go). A
    // mismatch means a broken spawn env, not a missing registry — fail loudly
    // rather than silently booting the full registry under a bogus identity.
    // KEEP IN SYNC with the canonical TS copy, COMPOSITION_NAME_RE in
    // codegen/core/plugin-registry-gen.ts — boot cannot import codegen.
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) {
      throw new Error(
        `Invalid SINGULARITY_WORKTREE "${name}" — cannot select a plugin registry.`,
      );
    }
    const perName = join(coreDir, `server.composition.${name}.generated.ts`);
    if (existsSync(perName)) return perName;
  }
  const singleton = join(coreDir, "server.composition.generated.ts");
  if (existsSync(singleton)) return singleton;
  return join(coreDir, "server.generated.ts");
}

const spec = selectRegistry();
export const { serverEntries } = (await import(
  spec
)) as typeof import("../core/server.generated");
