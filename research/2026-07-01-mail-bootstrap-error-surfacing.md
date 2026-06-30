# Mail bootstrap/first-connect sync failures must reach the sync-status banner

Date: 2026-07-01

## Problem

The Mail sync-status banner derives its state from `mail_sync_state` rows
(`deriveMailSyncView`). The most common first-run failure happens during
first-connect bootstrap (`ensureAccount` in `sync/server/internal/bootstrap.ts`):
the Gmail API calls (`getProfile`/`listLabels`) — and even `requireGmailToken()`
— run **before** any `mail_accounts` row exists. The per-account error sink
`recordSyncError(accountId, …)` is keyed on a `mail_sync_state` row whose
`accountId` FK requires an account, so a bootstrap-time failure (e.g. `403
accessNotConfigured` → "Gmail API has not been used / is disabled", or a
missing/invalid token) has **no row to attach to**.

Result: `mail_sync_state` stays empty → `deriveMailSyncView([])` = `idle` → the
banner renders nothing, while the real error only shows up as dead
`mail.sync-tick` jobs + crash reports (observed live: API disabled, 386 crash
reports, 126 dead jobs, 0 accounts). This is exactly the `api_disabled`/`auth`
case the banner remediation copy was built for — yet the one path that never
reaches it.

## Root cause

`ensureAccount` orders work as: token → Gmail API (`getProfile`, `listLabels`) →
*then* create account + arm `mail_sync_state`. Every failure point precedes the
only row the error machinery can write to. Additionally the tick calls
`ensureAccount()` **outside** its per-account try/catch, so the throw fails the
whole scheduled job → dead-letter spam.

## Fix (structural)

Establish the account row from identity available **without** a Gmail API call —
the connected Google account email, which auth/central already returns in the
OAuth `identity` of a successful token fetch — then wrap the Gmail API calls so
any failure records onto that real row and reaches the banner through the
existing single-source `deriveMailSyncView`.

Boundary preserved: the email is surfaced through the **gmail integration**
(`GmailTokenResult.email`), never `@plugins/auth` directly.

### Changes

1. `integrations/gmail/core/internal/token-result.ts` — add `email: string |
   null` to the `ok` variant of `GmailTokenResult`.
2. `integrations/gmail/server/internal/token.ts` — map `res.identity?.email ??
   null` into the ok result (already received from `getTokenFromCentral`).
3. `mail-core/server/internal/token.ts` — `requireGmailToken()` now returns
   `{ accessToken: string; email: string | null }` (the single mail-data auth
   entry point exposes the full usable connection, not just the token).
4. `sync/server/internal/{delta,backfill}.ts` — destructure `{ accessToken }`
   (token-only steady-state use).
5. `sync/server/internal/bootstrap.ts` — create the account from the resolved
   email **before** the first Gmail API call; wrap `getProfile`/`listLabels`/
   arming in try/catch → `recordSyncError(accountId, err)` then rethrow. Arm (or
   **re-arm**) `mail_sync_state` whenever the row is missing or is an unarmed
   error placeholder (`historyId == null`), capturing a fresh watermark and
   clearing the recorded error on success — so enabling the API + "Retry now"
   recovers cleanly.
6. `sync/server/internal/tick.ts` — wrap the first-connect `ensureAccount()` call
   so a recorded connection failure surfaces on the row/banner instead of
   dead-lettering the scheduled job every minute (consistent with the tick's
   existing per-account "record and move on" philosophy); log the swallowed
   error to the `mail-sync` channel for observability.

### Edge cases / assumptions

- For Google OAuth, `identity.email` == the Gmail mailbox address, so
  find-or-create by it reconciles with the later `profile.emailAddress`. If the
  integration surfaces no email (shouldn't happen once the Gmail scope is
  granted), bootstrap falls back to the profile email (legacy path); a
  null-email + api-disabled combination would remain unsurfaced, but that combo
  cannot occur with a granted scope.
- True disconnection (toggle on, Google not connected, no account row) keeps
  being the landing **empty-state's** domain (driven by `useGmailAccess`), not
  the banner.

No schema change (all touched columns are nullable / defaulted).
