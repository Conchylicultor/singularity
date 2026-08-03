import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { MAIL_SYNC_REMEDIATION } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import {
  mailSyncEndpoint,
  mailHydrateMessageEndpoint,
  mailSearchEndpoint,
} from "../../core";
import { ensureAccount } from "./bootstrap";
import { classifyMailSyncError } from "./classify-error";
import { kickSync } from "./record-error";
import { hydrateMessage } from "./hydrate";
import { remoteSearch } from "./remote-search";

// Manual sync trigger: arm the account, then `kickSync` to clear any recorded
// error and kick an immediate delta/backfill so "sync now" feels instant AND
// recovers an errored account. A first-connect or in-progress backfill
// self-continues via its own chain, so it is left untouched here.
//
// A "sync now" that can't run because the CONNECTION is broken (no consent, no
// token, Gmail API disabled) is a user-actionable state, not a server fault, so
// it answers 409 with the same remediation sentence the banner shows — the
// caller's auto-toast then reads "Gmail sign-in needed. Reconnect your Google
// account…" instead of a bare "HTTP 500". `unknown` is precisely the class we
// FAILED to classify, i.e. a real bug: it rethrows, 500s, and files a crash
// report. The raw technical reason is never swallowed — `ensureAccount` has
// already recorded it on `mail_sync_state.lastError`, where the banner's detail
// line reads it.
export const handleMailSync = implement(mailSyncEndpoint, async () => {
  let result;
  try {
    result = await ensureAccount();
  } catch (err) {
    const { code } = classifyMailSyncError(err);
    if (code === "unknown") throw err;
    const remediation = MAIL_SYNC_REMEDIATION[code];
    throw new HttpError(409, `${remediation.title}. ${remediation.body}`);
  }
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

// On-demand server-side search: fold older-than-window envelopes matching the
// Gmail query into the mirror and return them in Gmail's order. The 409-on-
// disconnect surfaces from inside `remoteSearch`, so this stays a one-liner.
export const handleMailSearch = implement(mailSearchEndpoint, ({ query }) =>
  remoteSearch(query.q, query.pageToken),
);
