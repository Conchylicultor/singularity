# Design: Mail phase 3 — read-only inbox (thread list + reading pane)

**Status:** Design + implementation (phase 3 of `research/2026-06-29-apps-gmail-client.md`).
**Date:** 2026-07-02
**Builds on:** phase 1 (data model, `mail-core`) + phase 2 (sync engine, `sync`). The
`mail_threads` / `mail_messages` / `mail_labels` tables are already populated by the
sync engine (this account: ~43k threads, ~58k messages, 43 labels). This phase makes
that data *visible*: a live thread list, a reading pane, system views + a label sidebar.

Triage actions (star/archive/trash/label) are **phase 4**, compose is **phase 5**,
search is **phase 6** — explicitly out of scope here. This is read-only.

---

## 1. What ships

- **Thread list** (Miller column 1) — Gmail-style rows: sender(s), subject, inline
  snippet, right-aligned relative date, **unread bolding**, star / paperclip /
  important indicators. Live (updates without polling), windowed for large mailboxes
  (virtual-rows + keyset pagination / infinite scroll).
- **Reading pane** (Miller column 2) — the messages of the opened thread, oldest→newest,
  each with header (from/to/date), collapsed quoted history, **privacy-safe HTML**
  (sanitized; remote images proxied + gated behind "Display images"), inline `cid:`
  images resolved, and attachment chips (download on click).
- **System views** — Inbox, Starred, Important, Sent, Drafts, Spam, Trash, All Mail.
- **Read-only label sidebar** — user labels (Gmail colors), with unread counts on views.

## 2. Plugin layout (new sub-plugins under `plugins/apps/plugins/mail/plugins/`)

| plugin | runtimes | owns |
|---|---|---|
| `mailbox` | core+server+web | view model (system views + filter descriptors, URL parse), labels resource, sidebar-counts resource, the `Mail.Sidebar` nav (system views + label tree) |
| `thread-list` | core+server+web | `queryThreadsEndpoint` (keyset page), `mailThreadsRevisionResource` (live tick), the `mailboxViewPane` list pane + `ThreadRow`, the index→inbox redirect |
| `reading-pane` | server+web | `threadMessagesResource` (live envelopes for a thread), the `threadPane` reading pane, message header/body/quote UI, attachment chips |
| `mail-html` | web | `<MailHtml>` — DOMPurify sanitize + remote-image gating + `cid:` resolution + quoted-history collapse. Pure string transforms co-tested. Adds the `dompurify` dep |
| `remote-images` | core+server | `/api/mail/image?url=` SSRF-guarded (`safeFetch`) streaming image proxy + `mailImageProxyUrl()` helper |
| `attachments` | server+web | lazy Gmail attachment blob download (`gmail-api` `getAttachment` wrapper → `createAttachment` → `storedAttachmentId`), `POST /api/mail/attachment`, `mailAttachmentUrl()` |

Boundary: everything consumes `mail-core` (schema/types), `gmail-api` (REST), and the
`sync` hydrate endpoint. No new coupling to `@plugins/auth` (goes through the gmail
integration / `mail-core`'s `requireGmailToken`).

## 3. Shared contracts (pin these — agents implement against them)

### 3.1 View model — `mailbox/core`

```ts
export type MailViewFilter =
  | { kind: "label"; labelId: string }              // label_ids @> [labelId]
  | { kind: "flag"; flag: "starred" | "important" } // boolean column = true
  | { kind: "allMail" };                            // NOT (SPAM|TRASH in label_ids)

export interface MailSystemView { id: string; title: string; filter: MailViewFilter }

// ordered for the sidebar
export const MAIL_SYSTEM_VIEWS: MailSystemView[] = [
  { id: "inbox",     title: "Inbox",     filter: { kind: "label", labelId: "INBOX" } },
  { id: "starred",   title: "Starred",   filter: { kind: "flag", flag: "starred" } },
  { id: "important", title: "Important", filter: { kind: "flag", flag: "important" } },
  { id: "sent",      title: "Sent",      filter: { kind: "label", labelId: "SENT" } },
  { id: "drafts",    title: "Drafts",    filter: { kind: "label", labelId: "DRAFT" } },
  { id: "all",       title: "All Mail",  filter: { kind: "allMail" } },
  { id: "spam",      title: "Spam",      filter: { kind: "label", labelId: "SPAM" } },
  { id: "trash",     title: "Trash",     filter: { kind: "label", labelId: "TRASH" } },
];
export const DEFAULT_MAIL_VIEW = "inbox";

// URL param encodes a system id ("inbox") or a user label ("label:Label_12").
export function parseMailView(view: string): MailViewFilter // throws-safe: unknown → inbox's filter? No — see note
export function mailViewLabelId(view: string): string | null // "label:X" → "X", else null
```
`parseMailView`: a system id → its filter; `label:<id>` → `{kind:"label",labelId:<id>}`;
unknown → `null` (caller falls back to default). Web owns the icon map by id (Material
icons) — icons are not in core.

### 3.2 Labels + counts resources — `mailbox` (server + core descriptors)

```ts
// core (shared descriptors)
mailLabelsResource     = resourceDescriptor<MailLabel[]>("mail-labels", z.array(MailLabelSchema), []);
mailViewCountsResource = resourceDescriptor<Record<string, number>>(
  "mail-view-counts", z.record(z.string(), z.number()), {});
```
- `mailLabelsResource` server: `mode:"push", identityTable:"mail_labels"`, loads
  `type="user"` labels for the resolved account, ordered by name.
- `mailViewCountsResource` server: `mode:"push", identityTable:"mail_threads"`,
  debounced; returns **unread thread counts** keyed by view id (system ids +
  `label:<id>` for user labels). One scan with `count(*) filter (...)`.

### 3.3 Thread list — `thread-list` (core + server)

```ts
// core
export const MailThreadPageSchema = z.object({
  items: z.array(MailThreadSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export const queryThreadsEndpoint = defineEndpoint({
  route: "POST /api/mail/threads",
  body: z.object({ view: z.string(), cursor: z.string().nullable(), limit: z.number() }),
  response: MailThreadPageSchema,
});
export const mailThreadsRevisionResource =
  resourceDescriptor<{ rev: string }>("mail-threads-revision", z.object({ rev: z.string() }), { rev: "" });
```
- **Server query**: resolve account → `WHERE account_id=? AND <viewFilter>` → order by
  `COALESCE(last_message_at, created_at) DESC, id DESC` → keyset seek from cursor →
  `LIMIT limit+1` (hasMore = extra row). Cursor = base64url(`${sortTsMillis}:${id}`).
  View filter SQL: `label` → `label_ids @> '["X"]'::jsonb`; `flag starred/important` →
  the boolean column; `allMail` → `NOT (label_ids @> '["SPAM"]' OR label_ids @> '["TRASH"]')`.
- **Revision tick**: `mode:"push", identityTable:"mail_threads", debounceMs:250`,
  loader returns coarse rev `${count}:${maxUpdatedAtMillis}` (byte-identical ⇒ no push).

### 3.4 Reading pane — `reading-pane` (server + core descriptor)

```ts
threadMessagesResource = resourceDescriptor<MailMessage[], { threadId: string }>(
  "mail-thread-messages", z.array(MailMessageSchema), []);
```
Server: `mode:"push", identityTable:"mail_messages"`, loads envelopes for `thread_id=?`
ordered by `internal_date ASC NULLS FIRST, id ASC`. Bodies are null until hydrated; the
pane calls the existing `mailHydrateMessageEndpoint` (`sync`) on first expand of a
message (cache hit after). Attachment metadata for a message comes back from hydrate.

### 3.5 Remote-image proxy — `remote-images`

```ts
// core
export const MAIL_IMAGE_PROXY_ROUTE = "GET /api/mail/image";
export function mailImageProxyUrl(remote: string): string; // `/api/mail/image?url=${encodeURIComponent(remote)}`
```
Server: **raw** handler (not `implement()` — streams bytes). `safeFetch(url,{timeoutMs})`,
require `content-type` starts with `image/` (else 415), stream body through with an
allowlisted header set (`content-type`, `content-length`, `cache-control: private, max-age=86400`).
`SsrfError` → 400, network/timeout → 502. Model on `apps/browser/plugins/proxy`.

### 3.6 Attachment download — `attachments`

`gmail-api` gains `getAttachment(token, messageId, attachmentId): Promise<{ data: Uint8Array }>`
(`users.messages.attachments.get`, base64url→bytes).

```ts
export const mailAttachmentDownloadEndpoint = defineEndpoint({
  route: "POST /api/mail/attachment",
  body: z.object({ attachmentRowId: z.string() }),          // mail_attachments.id
  response: z.object({ storedAttachmentId: z.string(), url: z.string() }),
});
export function mailAttachmentUrl(storedId: string): string; // `/api/attachments/${storedId}` (served by infra/attachments)
```
Server: load the `mail_attachments` row; if `storedAttachmentId` set → return its url
(cache hit); else `getAttachment` → `createAttachment(bytes, filename, mime)` →
`UPDATE mail_attachments SET stored_attachment_id=…` → return url.

### 3.7 `<MailHtml>` — `mail-html/web`

```tsx
<MailHtml
  html={string}
  showRemoteImages={boolean}
  onRemoteImagesDetected={(present: boolean) => void}
  resolveCid={(cid: string) => string | undefined}  // cid → attachment url (or undefined = blocked/unknown)
/>
```
Pipeline (client-side, `dompurify`): parse → **DOMPurify.sanitize** (drop `<script>`,
event handlers, `javascript:` urls; `ADD_ATTR:["target"]`; force `target=_blank`
`rel="noopener noreferrer"` on links) → walk the sanitized fragment:
- `img[src^="cid:"]` → `resolveCid(cid)`; if resolved set src, else drop.
- `img` with remote `http(s)` src / `background`/`style url()` → if `showRemoteImages`
  rewrite src to `mailImageProxyUrl(src)`, else strip the src and mark
  `data-blocked` (fire `onRemoteImagesDetected(true)`).
- **Quoted history**: detect the first `.gmail_quote`, top-level `<blockquote>`, or a
  `From:`-style forwarded divider; wrap it + following siblings in a collapsed
  `<details>`-like toggle ("Show trimmed content", a `•••` affordance).
Render the resulting HTML via `dangerouslySetInnerHTML` inside a style-scoped container
(reset that constrains email CSS: `max-width:100%` images, isolated font). Pure helpers
(`splitQuotedHtml`, `collectRemoteImageHosts`) live in `internal/` with a `bun:test`.

## 4. Layout & routing

`MailLayout` (shell) wires `sidebarSlot={Mail.Sidebar}` (currently omitted). Miller body:
- `mailboxViewPane` — `segment: "v/:view"`, the thread-list column (width ~440).
- `threadPane` — `segment: "t/:threadId"`, the reading pane (width grows).
- Index `mail-root` (segment ""): capability gate unchanged; when **ready**, redirect
  to `v/${DEFAULT_MAIL_VIEW}` via `openPane(mailboxViewPane,{view},{mode:"root"})`.
Selecting a row → `openPane(threadPane,{threadId},{mode:"push"})` (appends column;
truncates any deeper column). Sidebar nav → `openPane(mailboxViewPane,{view},{mode:"root"})`.
`selectedRowId` on the list is read from the open `threadPane`'s param so the row stays
highlighted.

## 5. Liveness model (no polling)

- **List**: `useInfiniteQuery(["mail-threads", view])` over `queryThreadsEndpoint`;
  subscribe to `mailThreadsRevisionResource`; on `rev` change call `refetch()` — RQ
  refetches loaded pages **in place** (preserves page count + scroll), only changed
  rows re-render (keyed `ThreadRow`). Switching view changes the query key → fresh
  page 0. This is the `all-conversations` pattern minus the DataView chrome.
- **Reading pane / sidebar / counts**: plain `useResource` push resources, auto-pushed
  by the DB change-feed (`identityTable`). No timers anywhere.

## 6. Risks / decisions

- **Keyset over `COALESCE(last_message_at, created_at)`** so the sort key is never null;
  a live insert at the head can duplicate a row across a page seam on refetch (rare,
  self-heals on view re-entry) — the accepted keyset-with-live-head tradeoff.
- **Client-side sanitize** (DOMPurify in the browser) is the standard webmail approach
  and keeps the server DOM-free; the raw HTML already lives in `mail_messages.body_html`.
- **Remote images**: never emitted until the user opts in per-message; the proxy is
  `safeFetch`-guarded and image-content-type-restricted, so it can't be an SSRF vector
  or an open proxy.
- **Attachments**: metadata is only present once a message is hydrated (`format=metadata`
  carries no MIME parts) — the paperclip in the *list* uses the thread `hasAttachments`
  rollup, which likewise fills on hydration; documented, not blocking.
- **Single account**: loaders resolve the first `mail_accounts` row; multi-account is
  phase 8.
```
