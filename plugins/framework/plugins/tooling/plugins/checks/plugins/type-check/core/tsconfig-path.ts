/**
 * Where a discovered tsc target's tsconfig actually is.
 *
 * `TscTarget` carries the target as a `tsc` COMMAND LINE (`dir` + `args`), but
 * the worker takes a config FILE, so every spawner has to read the `-p` back out
 * of those args. Structurally typed rather than importing `TscTarget`, so this
 * stays a leaf.
 */
import { join } from "path";

export function tsconfigPathOf(target: {
  dir: string;
  args: string[];
}): string {
  const i = target.args.indexOf("-p");
  return join(target.dir, i >= 0 ? target.args[i + 1]! : "tsconfig.json");
}
