import { existsSync } from "fs";
import { join } from "path";

// The composition filtered registry is gitignored and only present after a
// `./singularity build --composition <name>`. Its existence selects a
// self-contained app. The gateway spawns this server (`bun bin/index.ts`) and
// cannot pass env, so we branch on file existence at boot. Bun runs this
// unbundled, so the guarded dynamic import loads only the branch taken.
//
// The specifier is held in a variable (not a string literal pointing at the
// maybe-absent file) so tsc never tries to resolve the gitignored module.
const filtered = join(import.meta.dir, "../core/server.composition.generated.ts");
const spec = existsSync(filtered) ? filtered : "../core/server.generated.ts";
export const { serverEntries } = (await import(spec)) as typeof import("../core/server.generated");
