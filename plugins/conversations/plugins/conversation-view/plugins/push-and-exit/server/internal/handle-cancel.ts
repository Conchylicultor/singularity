import { implement } from "@plugins/infra/plugins/endpoints/server";
import { cancelPushAndExit } from "../../shared/endpoints";
import { clearJob } from "./state";

export const handleCancel = implement(cancelPushAndExit, async ({ params }) => {
  clearJob(params.id);
  return { ok: true };
});
