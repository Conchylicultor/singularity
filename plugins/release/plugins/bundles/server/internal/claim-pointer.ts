import { rmSync, symlinkSync } from "node:fs";
import { latestPointerPath } from "./pointer";

/**
 * Point `latest-<platform>` at `runId`.
 *
 * The ONLY writer of the pointer. It is called after a run has produced its
 * shippable artifact — never from the `--dev` staging path — so the invariant
 * "a `latest-<platform>` pointer names a PACKED run" holds by construction
 * rather than by every caller remembering it. A `--dev` run claiming the pointer
 * is what used to let `ship` resolve a run that was never packed.
 *
 * Relative target (`runId`, not the absolute dir) so the whole
 * `<comp>-<target>/` tree stays relocatable.
 */
export function claimLatestPointer(compDir: string, runId: string, platform: string): string {
  const pointer = latestPointerPath(compDir, platform);
  rmSync(pointer, { force: true });
  symlinkSync(runId, pointer);
  return pointer;
}
