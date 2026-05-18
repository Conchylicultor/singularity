import { setTaskAutoStart } from "@plugins/tasks/plugins/auto-start/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { clearTaskAutoStart } from "../../core/endpoints";

// Clear the autoStart columns on a single task. Per-dep trigger rows stay
// alive but no-op when they fire (maybe-launch reads autoStartAt and exits
// early if it's null). Cheaper than reverse-walking trigger tables to
// delete them up-front.
export const handleClearAutoStart = implement(clearTaskAutoStart, async ({ params }) => {
  const ok = await setTaskAutoStart(params.id, null);
  if (!ok) throw new HttpError(404, "Not found");
  // return undefined → implement() sends 204
});
