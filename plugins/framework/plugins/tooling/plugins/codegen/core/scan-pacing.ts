import type { RepoFiles } from "@plugins/framework/plugins/tooling/core";
import { yieldMacrotask } from "@plugins/packages/plugins/macrotask-yield/core";

// How long a scan may run synchronously before it gives the thread back. A check
// pass runs every check on one JS thread, so a parse loop that never yields
// holds up every other check and every timer for its whole length.
const SLICE_MS = 10;

/**
 * A yield budget shared by one scan's parse loops. `await tick()` between units
 * of synchronous work returns at once until ~10 ms have run since the last
 * yield, then yields a MACROTASK, so timers and I/O callbacks run in between.
 *
 * One budget per scan, not per loop: a scan's continuations interleave (several
 * plugins' reads resolve together), and a shared clock is what bounds the run
 * of synchronous work between any two yields.
 */
export function timeSlicer(): () => Promise<void> {
  let since = performance.now();
  return async () => {
    if (performance.now() - since < SLICE_MS) return;
    await yieldMacrotask();
    since = performance.now();
  };
}

/**
 * The text of `rel`, which the caller took from `repo`'s own listing.
 *
 * `repo.read` answers null for a file that is not in the set OR that vanished
 * after the set was listed. A caller that got `rel` from the listing has ruled
 * out the first, so null here means the tree changed under the run — and a
 * scan finished over a tree that moved is not a verdict about any tree. Throw.
 */
export async function readListed(
  repo: RepoFiles,
  rel: string,
): Promise<string> {
  const text = await repo.read(rel);
  if (text === null) {
    throw new Error(
      `${rel} is in the repo's file set but could not be read — it was removed ` +
        `after the set was listed. Re-run once the working tree is stable.`,
    );
  }
  return text;
}
