import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { triggerReleaseEndpoint } from "../../core/endpoints";
import { releaseTargetById } from "../../core/targets";
import { triggerRelease } from "./run-release";

export const handleRelease = implement(triggerReleaseEndpoint, ({ body }) => {
  const target = releaseTargetById(body.target);
  if (!target?.implemented) {
    throw new HttpError(400, `Unknown or unimplemented release target: ${body.target}`);
  }
  triggerRelease(body.composition, body.target);
});
