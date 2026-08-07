import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { formatSource } from "@plugins/framework/plugins/tooling/plugins/format/core";

/**
 * The ONE write seam for every generated artifact.
 *
 * The idiom `if (next !== existing) writeFileSync(file, next)` used to be spelled
 * out at thirteen emit sites, and each `*-in-sync` check re-spelled the matching
 * comparison. That is two owners of the on-disk byte format, which is exactly how
 * an emitter and its checker drift apart. Both sides now call
 * {@link formatGenerated}, so they cannot.
 */

/**
 * The exact bytes that would be written for `file`.
 *
 * Path-driven via the format allowlist, so `.md` (docgen) and `.jsonc` (config
 * origins, authored overrides) route through this SAME funnel and come back
 * unchanged. No special-casing, no per-emitter opt-in.
 *
 * This is the CODEGEN-SIDE NAME for a policy owned elsewhere, kept as a named
 * seam because it states intent at every emit and check site. Whether
 * `*.generated.ts` is formatted is decided by `FORMAT_GENERATED_ARTIFACTS` in
 * `format/core` — which the build's changed-set pass reads too. Do not
 * reintroduce a local copy of that switch: when the two writers disagreed, the
 * symptom was a deterministic ping-pong (codegen writes the file, the format
 * pass — which runs after all codegen — rewrites it) and every `*-in-sync`
 * check over a generated file went red.
 *
 * Callers are BOTH the emitters (via {@link writeGenerated}) and the `*-in-sync`
 * checks, which compare disk against `formatGenerated(file, renderX(...))`.
 * Applying it on both sides rather than inside each `renderX` keeps one owner of
 * the byte format and leaves the sync renderers sync.
 */
export async function formatGenerated(
  file: string,
  content: string,
): Promise<string> {
  return await formatSource(file, content);
}

/**
 * The ONE write idiom for every generated artifact: render → format → write iff
 * the bytes differ.
 *
 * Write-on-difference is load-bearing, not an optimization: web artifacts are
 * fingerprinted on `(mtimeMs, size)`, so an unconditional write would invalidate
 * an artifact whose bytes never changed and rebuild the fleet for nothing.
 *
 * The parent directory is created on the write path, so an emitter producing a
 * file at a not-yet-existing path (config origins, seeded overrides) does not
 * have to remember to `mkdirSync` first.
 */
export async function writeGenerated(
  file: string,
  content: string,
): Promise<void> {
  const next = await formatGenerated(file, content);
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (next === existing) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, next);
}
