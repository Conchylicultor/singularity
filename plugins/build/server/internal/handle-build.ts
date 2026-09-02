import { implement } from "@plugins/infra/plugins/endpoints/server";
import { triggerBuildEndpoint } from "../../core/endpoints";
import { buildJob } from "./run-build";

export const handleBuild = implement(triggerBuildEndpoint, async () => {
  // Enqueue and return. The claim, the spawn and everything a finished build
  // causes belong to the durable workflow — a build outlives this request by
  // minutes and outlives this backend, which it restarts.
  await buildJob.enqueue({ trigger: "manual" });
});
