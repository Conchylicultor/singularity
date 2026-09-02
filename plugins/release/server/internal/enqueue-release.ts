import { newReleaseRunId } from "@plugins/release/plugins/bundles/server";
import type { ReleaseIntent } from "../../core/endpoints";
import { releaseJob } from "./release-job";

/**
 * What to cut, and why.
 *
 * An options object rather than positional args because `intent` is the
 * parameter that changes what the artifact IS (staged vs shippable), and a third
 * positional would read as an afterthought at every call site.
 */
export interface TriggerReleaseOptions {
  composition: string;
  target: string;
  /** See `ReleaseIntent` — decides `--dev` vs `--platform <tag>`, and `kind`. */
  intent: ReleaseIntent;
}

/**
 * Request one release, and answer the id of the run it will be.
 *
 * The one way a release is started. It returns as soon as the job row is in the
 * queue — the build itself happens in `releaseJob`, out of process, and outlives
 * every backend between here and its end.
 *
 * **The id is minted here, before anything is claimed**, because a sequencing
 * caller has to be able to name the run it will wait for: `awaitRelease` filters
 * `supervisedRun.ended` on `(kindId, runId)`, and a caller that learned the id
 * only when the run ended could not have subscribed to it. Naming a run is not
 * claiming it — the LOCK is still the job's claiming INSERT, so two enqueues of
 * the same composition both get an id and the second one's claim loses.
 *
 * There is no in-process re-entry guard any more. The old one existed because
 * `triggerRelease` was fire-and-forget and a double-clicked button would spawn
 * twice before the DB heard about either; now the request IS a queue row, the
 * claim is the lock, and a losing claim ends its own workflow cleanly. A
 * module-level boolean would only have added a way to silently drop a legitimate
 * request.
 */
export async function enqueueRelease(
  opts: TriggerReleaseOptions,
): Promise<string> {
  const releaseId = newReleaseRunId();
  await releaseJob.enqueue({
    releaseId,
    composition: opts.composition,
    target: opts.target,
    intent: opts.intent,
  });
  return releaseId;
}
