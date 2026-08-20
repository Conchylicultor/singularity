import { join } from "path";
import { worktreesDir } from "@plugins/infra/plugins/paths/core";
import { selectRegistry } from "./select-registry";
import { readSpecComposition } from "./spec-composition";

// The boot-time application of the two pure, tested steps beside this file:
// `./spec-composition` answers WHICH APP this backend is, and `./select-registry`
// turns that into a registry path.
//
// Identity comes off `~/.singularity/worktrees/<namespace>/spec.json` — the same
// file the gateway read to spawn this process — rather than from an env var the
// gateway would have to pass. `./singularity build` rebuilds this backend but
// not the Go gateway, so a running gateway is routinely older than the tree it
// serves; a value that had to survive that hop could silently go missing, and a
// missing composition means booting the full app under a composition's own
// namespace and database. Reading the file leaves nothing to drop, and no way
// for the gateway's view and the backend's to disagree.
//
// `SINGULARITY_WORKTREE` still comes from the env: it is this backend's
// namespace, hence its spec dir basename, and `selectRegistry` validates it.
//
// `worktreesDir` is free here — `bin/index.ts` already imports this same barrel,
// so nothing is added to the boot import closure.
//
// All composition registries are gitignored, so the specifier is held in a
// variable (never a string literal pointing at a maybe-absent file) — tsc must
// not try to resolve the gitignored modules. Bun runs this unbundled, so the
// guarded dynamic import loads only the branch taken.
const namespace = process.env.SINGULARITY_WORKTREE;
const spec = selectRegistry(
  join(import.meta.dir, "../core"),
  namespace,
  readSpecComposition(worktreesDir(), namespace),
);

export const { serverEntries } = (await import(
  spec
)) as typeof import("../core/server.generated");
