import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  mailSyncEndpoint,
  mailHydrateMessageEndpoint,
} from "../../core";
import { ensureAccount } from "./bootstrap";
import { kickSync } from "./record-error";
import { hydrateMessage } from "./hydrate";

// Manual sync trigger: arm the account, then `kickSync` to clear any recorded
// error and kick an immediate delta/backfill so "sync now" feels instant AND
// recovers an errored account. A first-connect or in-progress backfill
// self-continues via its own chain, so it is left untouched here.
export const handleMailSync = implement(mailSyncEndpoint, async () => {
  const result = await ensureAccount();
  if (
    result.status === "delta" ||
    result.status === "idle" ||
    result.status === "error"
  ) {
    await kickSync(result.accountId);
  }
  return result;
});

// On-demand body hydration: fetch + cache one message's full body on open (or
// serve it straight from the mirror on a repeat open). See `hydrate.ts`.
export const handleMailHydrate = implement(
  mailHydrateMessageEndpoint,
  ({ body }) => hydrateMessage(body.messageId),
);
