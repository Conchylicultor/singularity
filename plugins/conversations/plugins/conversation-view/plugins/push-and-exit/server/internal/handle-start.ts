import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { sendTurn } from "@plugins/conversations/server";
import { startPushAndExit } from "../../shared/endpoints";
import { PUSH_AND_EXIT_PROMPT } from "./prompt";
import { hasRunning, startJob, setStatus } from "./state";

export const handleStart = implement(startPushAndExit, async ({ params }) => {
  const { id } = params;
  if (hasRunning(id)) {
    throw new HttpError(409, "Already running");
  }
  startJob(id);
  try {
    await sendTurn(id, PUSH_AND_EXIT_PROMPT);
  } catch (err) {
    setStatus(id, "error", err instanceof Error ? err.message : String(err));
    throw err;
  }
  return { ok: true };
});
