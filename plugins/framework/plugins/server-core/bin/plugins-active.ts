import { join } from "path";
import { selectRegistry } from "./select-registry";

// The selection chain itself lives in `./select-registry` (pure, tested); this
// module is the boot-time application of it.
//
// All composition registries are gitignored, so the specifier is held in a
// variable (never a string literal pointing at a maybe-absent file) — tsc must
// not try to resolve the gitignored modules. Bun runs this unbundled, so the
// guarded dynamic import loads only the branch taken.
const spec = selectRegistry(
  join(import.meta.dir, "../core"),
  process.env.SINGULARITY_WORKTREE,
);

export const { serverEntries } = (await import(
  spec
)) as typeof import("../core/server.generated");
