import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { sendTurn } from "@plugins/conversations/server";
import { startPushAndExit } from "../../shared/endpoints";
import { PUSH_AND_EXIT_PROMPT } from "./prompt";
import { recordNotification } from "@plugins/notifications/server";
import { hasRunning, startJob, setStatus, clearJob } from "./state";

export const handleStart = implement(startPushAndExit, async ({ params }) => {
  const { id } = params;
  if (hasRunning(id)) {
    throw new HttpError(409, "Already running");
  }
  startJob(id);
  try {
    await sendTurn(id, PUSH_AND_EXIT_PROMPT);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(id, "error", message);
    // Server-side terminus of the failed push-and-exit flow. The client used
    // to react to the "error" job status from a per-tab effect that both
    // toasted (duplicating the notification row per open tab) and DELETE'd the
    // job. Persist the failure notification once and tear the job down here so
    // the button returns to its normal state — matching the prior UX where the
    // error state was surfaced via the toast, not a sticky resource row.
    await recordNotification({
      type: "conversation",
      title: `Push & Exit failed: ${message}`,
      description: `Push & Exit failed: ${message}`,
      variant: "error",
      dedupeKey: `push-and-exit-error:${id}`,
    });
    clearJob(id);
    throw err;
  }
  return { ok: true };
});
