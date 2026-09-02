import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { STAGED_INTENT, triggerReleaseEndpoint } from "../../core/endpoints";
import { releaseTargetById } from "../../core/targets";
import { enqueueRelease } from "./enqueue-release";

export const handleRelease = implement(
  triggerReleaseEndpoint,
  async ({ body }) => {
    const target = releaseTargetById(body.target);
    if (!target?.implemented) {
      throw new HttpError(
        400,
        `Unknown or unimplemented release target: ${body.target}`,
      );
    }
    // The door is the ONE place an omitted intent is resolved, so the engine
    // below it always sees a complete `ReleaseIntent` and never a "maybe staged"
    // third state.
    //
    // Awaited, so a queue that refuses the enqueue is a failed request rather
    // than a button that appears to have worked. The release itself is not
    // awaited by anyone — it is a job, and its outcome reaches the UI through
    // `release_runs` and the log channel.
    await enqueueRelease({
      composition: body.composition,
      target: body.target,
      intent: body.intent ?? STAGED_INTENT,
    });
  },
);
