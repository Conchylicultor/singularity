import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getConfig } from "@plugins/config_v2/server";
import { sendTurn } from "@plugins/conversations/server";
import { startPushAndExit } from "../../shared/endpoints";
import { pushAndExitConfig } from "../../shared/config";

// Fire-and-forget: inject the wrap-up prompt and return. The conversation's own
// status (working → waiting/done) is the single source of truth for the button
// state — no separate job row to track or tear down. Awaiting `sendTurn` only
// surfaces an immediate inject failure to the clicking tab as a toast.
export const handleStart = implement(startPushAndExit, async ({ params }) => {
  await sendTurn(params.id, getConfig(pushAndExitConfig).prompt);
});
