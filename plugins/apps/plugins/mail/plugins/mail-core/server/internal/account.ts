import { db } from "@plugins/database/server";
import { _mailAccounts } from "./tables";

// The mail app is single-account for now (multi-account is a later phase). Every
// read path (thread query, labels/counts resources, reading pane) scopes to "the"
// account via this one helper, so when multi-account lands there is a single
// place to thread an explicit account id through. Returns null when no account
// has connected yet, so loaders return empty rather than throwing on a cold
// mailbox.
export async function resolveMailAccountId(): Promise<string | null> {
  const [row] = await db
    .select({ id: _mailAccounts.id })
    .from(_mailAccounts)
    .limit(1);
  return row?.id ?? null;
}
