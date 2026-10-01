import { db } from "@plugins/database/server";
import { serveValue } from "@plugins/network/plugins/live/server";
import { mailAccount } from "../../core";
import { readMailAccount } from "./account";

// The connected account (or `null`), recomputed by the change feed on every
// write to `mail_accounts`. One row — no `unbounded` reason to state.
export const mailAccountServed = serveValue(mailAccount, {
  source: "db",
  loader: () => readMailAccount(db),
});
