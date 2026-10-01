import { asc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@plugins/database/server";
import { _mailAccounts } from "./tables";

/** THE connected account, as every mail read path sees it. */
export interface MailAccountRef {
  id: string;
  email: string;
}

// The mail app shows one account (multi-account is a later phase): the
// EARLIEST connected — `connected_at`, then `id` as the tie-break, so the
// choice is deterministic when a second Google account has connected (sync's
// `findOrCreateAccount` keys accounts by email, and nothing deletes one).
// This is the ONE definition: the `mailAccount` live value serves it (so the
// threads list scopes to it) and `resolveMailAccountId` answers it for every
// server read path (labels, reading pane). `null` when no account has
// connected yet, so loaders return empty rather than throwing on a cold
// mailbox. Takes its executor so a DB test can pin the choice
// (`account.test.ts`).
export async function readMailAccount(
  executor: NodePgDatabase,
): Promise<MailAccountRef | null> {
  const [row] = await executor
    .select({ id: _mailAccounts.id, email: _mailAccounts.email })
    .from(_mailAccounts)
    .orderBy(asc(_mailAccounts.connectedAt), asc(_mailAccounts.id))
    .limit(1);
  return row ?? null;
}

export async function resolveMailAccountId(): Promise<string | null> {
  return (await readMailAccount(db))?.id ?? null;
}
