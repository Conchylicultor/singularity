import { implement } from "@plugins/infra/plugins/endpoints/server";
import { mailSyncEndpoint } from "../../core";
import { ensureAccount } from "./bootstrap";
import { deltaJob } from "./delta";

// Manual sync trigger: arm the account, and if it is already in steady-state
// delta, kick an immediate delta so "sync now" feels instant. A backfilling
// account self-continues via its own chain, so no extra enqueue is needed there.
export const handleMailSync = implement(mailSyncEndpoint, async () => {
  const result = await ensureAccount();
  if (result.status === "delta") {
    await deltaJob.enqueue({ accountId: result.accountId });
  }
  return result;
});
