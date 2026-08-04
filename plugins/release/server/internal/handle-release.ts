import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { STAGED_INTENT, triggerReleaseEndpoint } from "../../core/endpoints";
import { releaseTargetById } from "../../core/targets";
import { triggerRelease } from "./run-release";

export const handleRelease = implement(triggerReleaseEndpoint, ({ body }) => {
  const target = releaseTargetById(body.target);
  if (!target?.implemented) {
    throw new HttpError(400, `Unknown or unimplemented release target: ${body.target}`);
  }
  // The door is the ONE place an omitted intent is resolved, so the engine below
  // it always sees a complete `ReleaseIntent` and never a "maybe staged" third
  // state.
  triggerRelease({
    composition: body.composition,
    target: body.target,
    intent: body.intent ?? STAGED_INTENT,
  });
});
