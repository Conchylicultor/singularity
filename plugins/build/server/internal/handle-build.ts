import { implement } from "@plugins/infra/plugins/endpoints/server";
import { triggerBuildEndpoint } from "../../core/endpoints";
import { triggerBuild } from "./run-build";

export const handleBuild = implement(triggerBuildEndpoint, () => {
  triggerBuild("manual");
  return { ok: true };
});
