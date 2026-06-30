# Mail — Phase 1: App scaffold + Gmail data model (design)

**Status:** Design for the phase-1 foundation task. North-star: [`2026-06-29-apps-gmail-client.md`](./2026-06-29-apps-gmail-client.md).
**Date:** 2026-06-29
**Scope:** App scaffold (rail entry + shell + landing), the persisted mail data model, and the wiring to obtain a Gmail-scoped Google token. **No** sync engine, inbox UI, triage, compose, or search (later phases).

---

## 1. Two plugins touched

### A. `plugins/integrations/plugins/gmail/` — give it a public consumer API

Today the integration's `web`/`server` barrels export only `default`, and `gmailConfig`/`GMAIL_SCOPES` live in `shared/` (plugin-private, R10). So **nothing is legally consumable**. The vision requires the app to consume the integration's barrel for the enabled/scope signal and token — so the integration must expose that capability publicly. gmail is a feature plugin (not load-bearing infra), so this is the intended clean fix, not a workaround.

New public surface (the integration owns the Gmail vocabulary; consumers never import `@plugins/auth/*` or name the scope string):

- **`core`** (new barrel):
  - `GMAIL_SCOPES` — moved here from `shared/scopes.ts` (a public closed-list constant belongs in `core`). Internal gmail web/server import it via `../core`.
  - `GmailTokenResult` — gmail-owned result type (NOT a re-export of auth's `TokenResponse`, which the no-cross-plugin-re-export rule forbids):
    ```ts
    export type GmailTokenResult =
      | { ok: true; accessToken: string; expiresAt: number; scopes: string[] }
      | { ok: false; needsConsent: boolean; message: string };
    ```
- **`server`** (added named exports, keep `default`):
  - `getGmailToken(): Promise<GmailTokenResult>` — wraps `getTokenFromCentral({ providerId: "google", scopes: [...GMAIL_SCOPES] })` and maps the auth `TokenResponse` into `GmailTokenResult`.
  - `isGmailEnabled(): boolean` — `getConfig(gmailConfig).enabled`.
- **`web`** (added named exports, keep `default`):
  - `useGmailAccess(): GmailAccess` where
    ```ts
    interface GmailAccess { enabled; connected; scopesGranted; ready; loading: boolean }
    ```
    Internally composes `useConfig(gmailConfig)` + `useAccountStatus("google")` + `missingScopes([...GMAIL_SCOPES], status.scopes)`. `ready = enabled && connected && scopesGranted`.

### B. `plugins/apps/plugins/mail/` — the new app (create-app pattern)

```
plugins/apps/plugins/mail/
  package.json                       # @singularity/plugin-apps-mail (has description)
  web/index.ts                       # empty namespace plugin (contributions: [])
  plugins/
    shell/                           # @singularity/plugin-apps-mail-shell
      core/app.ts                    # defineApp({ id:"mail", basePath:"/mail", iconKey:"mail" })
      core/index.ts                  # export { mailApp }
      web/slots.ts                   # Mail = { Sidebar: defineRenderSlot<AppShellSidebarItem>("mail.sidebar") }
      web/panes.tsx                  # mailRootPane (segment "", appPath /mail)
      web/index.ts                   # Apps.App({ icon: mdAppIcon(MdMail) }) + Pane.Register(mailRootPane)
      web/components/mail-layout.tsx # AppShellLayout sidebarSlot={Mail.Sidebar} + <MillerColumns/>
      web/components/mail-root.tsx   # capability-driven landing/empty-state (useGmailAccess)
    mail-core/                       # @singularity/plugin-apps-mail-mail-core (server + core only)
      core/index.ts                  # domain types + enums (web-safe)
      core/internal/types.ts
      core/internal/enums.ts
      server/index.ts                # default ServerPluginDefinition + re-export tables + requireGmailToken
      server/internal/tables.ts      # raw pgTable model (drizzle-kit glob discovers this)
      server/internal/schema-attachments.ts  # Attachments.defineLink(_mailDrafts)
      server/internal/token.ts       # requireGmailToken(): consumes gmail integration getGmailToken
```

The landing (`mail-root.tsx`) renders, via `useGmailAccess()`, one of: loading / "Enable Gmail in Settings" / "Connect your Google account" / "Grant Gmail access" / "Mail is connected — inbox coming soon". Built from CSS layout primitives (Center/Stack/Text/Button), not raw divs. This validates the entire web wiring end-to-end in phase 1.

---

## 2. Data model (`mail-core/server/internal/tables.ts`, raw `pgTable`)

Threads and messages are modeled distinctly from day one. All ids are Gmail-native strings (thread/message/label ids) so sync is idempotent. FK cascades give referential integrity the sync engine relies on.

- **`mail_accounts`** — `id` PK, `email`, `name`, `avatarUrl?`, `signature?`, `connectedAt?`, `createdAt`, `updatedAt`.
- **`mail_sync_state`** — `accountId` PK FK→accounts CASCADE (1:1), `historyId?`, `lastFullSyncAt?`, `lastDeltaSyncAt?`, `status` (text), `createdAt`, `updatedAt`.
- **`mail_labels`** — `id` PK (Gmail label id), `accountId` FK CASCADE, `name`, `type` (`system|user`), `color?`, `textColor?`, `parentId?` (self-FK SET NULL), `messageListVisibility?`, `labelListVisibility?`, `createdAt`, `updatedAt`. idx(accountId).
- **`mail_threads`** — `id` PK (Gmail thread id), `accountId` FK CASCADE, `subject`, `snippet`, `participants` jsonb (`{name?,email}[]`), `lastMessageAt`, `messageCount` int, `unread` bool, `starred` bool, `important` bool, `hasAttachments` bool, `labelIds` jsonb (denormalized for fast list filter), `historyId?`, `createdAt`, `updatedAt`. idx(accountId, lastMessageAt desc).
- **`mail_messages`** — `id` PK (Gmail message id), `threadId` FK→threads CASCADE, `accountId` FK CASCADE, `from` jsonb (`{name?,email}`), `to`/`cc`/`bcc`/`replyTo?` jsonb arrays, `subject`, `snippet`, `headers` jsonb, `bodyText?`, `bodyHtml?` (sanitized), `internalDate`, `unread` bool, `starred` bool, `isDraft` bool, `isSent` bool, `sizeEstimate?` int, `historyId?`, `createdAt`, `updatedAt`. idx(threadId), idx(accountId).
- **`mail_message_labels`** — `messageId` FK→messages CASCADE, `labelId` FK→labels CASCADE, composite PK, idx(labelId). M:N.
- **`mail_attachments`** — received-message attachment metadata: `id` PK, `messageId` FK CASCADE, `accountId` FK CASCADE, `gmailAttachmentId` (for lazy fetch), `filename`, `mimeType`, `sizeBytes` int, `inline` bool, `contentId?` (cid: inline images), `storedAttachmentId?` (text — infra/attachments id once cached). idx(messageId).
- **`mail_drafts`** — compose drafts (outbound): `id` PK, `accountId` FK CASCADE, `threadId?` FK SET NULL, `gmailDraftId?`, `inReplyToMessageId?`, `to`/`cc`/`bcc` jsonb, `subject`, `bodyHtml`, `bodyText?`, `createdAt`, `updatedAt`. + `Attachments.defineLink(_mailDrafts)` for user-uploaded compose attachments.
- **`mail_outbox`** — optimistic-mutation queue: `id` PK, `accountId` FK CASCADE, `opType` (text), `targetType` (text), `targetId` (text), `payload` jsonb, `status` (`pending|inflight|done|failed`), `attempts` int default 0, `lastError?`, `createdAt`, `updatedAt`. idx(accountId, status).

**Received vs outbound attachments are split intentionally:** `mail_attachments` tracks Gmail-owned, lazily-fetched attachment metadata (download deferred to phase 5+); the `Attachments.defineLink` on drafts handles user-uploaded compose attachments that live on local disk.

---

## 3. Why raw `pgTable`, not `defineEntity`

`defineEntity` (`infra/entities`) gives `table.$inferSelect ≡ z.infer<schema>` by construction but **has no FK / `.references()` support** — it only layers `.notNull()/.primaryKey()/.default()`. The mail model is a relational FK-cascade cluster, so it follows the established `tasks-core` precedent: raw `pgTable` with `.references(..., { onDelete })`. Wire zod schemas are derived server-side via `createSelectSchema`; web-safe domain types live hand-authored in `core`.

**Follow-up filed:** add FK/`.references()` support to `defineEntity` so relational clusters can adopt the entities primitive (would let mail migrate later).

---

## 4. No-OAuth-reimplementation invariant

The mail app imports **only** the gmail integration barrels (`@plugins/integrations/plugins/gmail/{web,server,core}`). It never imports `@plugins/auth/*` and never names the `https://mail.google.com/` scope — the integration owns both. This is the boundary the vision describes, enforced by construction.
</content>
</invoke>
