# threads

The Mail app's **one** surface: a single `data-view` at `/mail/threads` over
`mail_threads`, rendered as a Gmail-style list, whose **tabs are the mailboxes**.
One URL, one DataView, eight view instances. There is no route param, no second
thread list, and no sidebar mailbox nav.

## A mailbox is a view instance, and its scope is an ordinary filter

The eight mailboxes are authored view rows in
`config/apps/mail/threads/mail-threads.jsonc` — `inbox`, `starred`, `important`,
`sent`, `drafts`, `all`, `spam`, `trash` — each with a real, **user-editable**
`filter` and the date-desc sort. "Inbox" is definitionally the view whose filter
is `labels contains INBOX`.

The scope therefore travels the completely standard DataView path and nothing
else:

```
active view's `filter`  →  request body `FilterGroup`  →  compileWhere  →  SQL
```

There is no `view` field on the request, no server-side scope derivation, no
locked chips, no `baseFilter`. The Filter pill shows `Labels contains Inbox` as
an ordinary removable chip; editing it rewrites the config row and persists. The
old "a user must not pull Spam into Inbox" invariant is retired by decision —
that is the user's call if they set up the filters (v2 design doc).

**The failure mode to know about:** an unresolvable `fieldId`/`operatorId` is
dropped *fail-soft* by `compileWhere`, so a typo in the config makes a tab
silently show every thread rather than error. `server/internal/where.test.ts`
reads the real config file, compiles every authored filter to SQL and asserts
each rule survives — that test is the guard, keep it green.

## Server

- **`queryThreads`** (`POST /api/mail/threads/query`) — one keyset page.
  `buildThreadsWhere` ANDs `[account, ilike search over subject/snippet, the
  compiled `FilterGroup`, the null-aware keyset seek]`. The account predicate is
  identity, not scope — it is the only server-owned conjunct.
- **`mailThreadsRevisionResource`** — a coarse `${count}:${maxUpdatedMs}` tick
  over `mail_threads` (`mode:"push"`). Tab-independent on purpose: a thread can
  move between mailboxes, so any thread write refetches the loaded window in
  place (no scroll reset).

## Web

- **`mailThreadsPane`** (`segment: "threads"`, no params). Two-line `ThreadRow`
  via `viewOptions.list.renderRow` + a leading star; `onRowActivate` pushes
  `threadPane`; `selectedRowId` comes off `threadPane`'s own route param, so the
  open thread's row is highlighted.
- `MAIL_THREAD_FIELDS` drives the Sort pill (Subject / Date / Messages) and the
  Filter pill, and is the contract the authored config rows are written against —
  rename a field id and the matching config rules go with it. **`labels` (type
  `tags`) is the axis every mailbox tab lives on**: not sortable (a jsonb array
  has no order); its `options` map label id → friendly name (system ids locally,
  user labels from `mailLabelsResource`), which is what keeps "Label_12" off the
  screen. `sender`/`snippet` are display-only, not fields — server search covers
  them.

## Boundaries

Consumes only barrels: `mail-core` (schema/types, `mailLabelsResource`,
`resolveMailAccountId`, `_mailThreads`), `reading-pane/web` (`threadPane`), and
the data-view / server-query / endpoint / live-state / pane primitives. It must
**never** be imported by the mail `shell` (that would cycle) — the `/mail`
landing repoint is the route STRING `/mail/threads`.

## Plugin reference

- Description: The Mail app's one mailbox surface: a route-parameterized DataView (/mail/v/:view) serving every system view and user label as a server-delegated keyset query over mail_threads, with the mailbox scope rendered as visible, non-removable filter chips. Threads DataView server: the keyset thread query (POST /api/mail/threads/query) over mail_threads, whose mailbox scope is re-derived from the request's view id (never from the body filter), + the scalar revision-tick live resource that keeps the loaded window fresh.
- Web:
  - Slots: `mailThreadsPane.Actions`
  - Contributes: `Pane.Register` "mail-threads"
  - Uses:
    - `apps/mail/reading-pane.threadPane`
    - `infra/endpoints.fetchEndpoint`
    - `primitives/css/fill.Fill`
    - `primitives/css/line.Line`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/data-view.DataView`
    - `primitives/data-view.defineDataView`
    - `primitives/live-state.matchResource`
    - `primitives/live-state.useResource`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
    - `primitives/pane.useOpenPane`
    - `primitives/relative-time.RelativeTime`
  - Exports (values): `mailThreadsPane`
- Server:
  - Contributes: `resource.declare` "mail-threads-revision"
  - Uses:
    - `apps/mail/mail-core._mailThreads`
    - `apps/mail/mail-core.mailViewFilterSql`
    - `apps/mail/mail-core.resolveMailAccountId`
    - `database.db`
    - `fields/server-capabilities-loader`
    - `fields/server-capabilities.resolveFieldFilterSql`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `primitives/data-view/server-query.compileWhere`
    - `primitives/data-view/server-query.OperatorSqlResolver`
    - `primitives/keyset.buildSortKeys`
    - `primitives/keyset.keyValuesOf`
    - `primitives/keyset.orderByClauses`
    - `primitives/keyset.seekPredicate`
  - Exports (values):
    - `buildThreadsWhere`
    - `handleQuery`
    - `mailThreadsRevisionServerResource`
    - `mailViewScopeSql`
  - Resources: `mail-threads-revision` (push)
  - Routes: `POST /api/mail/threads/query`
- Core:
  - Uses:
    - `apps/mail/mail-core.MAIL_THREAD_FIELD_IDS`
    - `apps/mail/mail-core.MailThreadSchema`
    - `infra/endpoints.defineEndpoint`
    - `primitives/data-view.FilterGroupSchema`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `MailThreadFieldSpec`
    - `MailThreadFieldType`
    - `QueryThreadsBody`
  - Exports (values):
    - `MAIL_THREAD_FIELDS`
    - `mailThreadsRevisionResource`
    - `queryThreads`
    - `QueryThreadsBodySchema`
    - `QueryThreadsResponseSchema`
    - `SortRuleSchema`
- Cross-plugin:
  - Imported by: `apps/mail/mailbox`

<!-- AUTOGENERATED:END -->

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The Mail app's one mail surface (/mail/threads): a single DataView over mail_threads whose TABS are the mailboxes — each an authored view instance whose scope is an ordinary, user-editable filter travelling the standard server-delegated keyset query path. Threads DataView server: the keyset thread query (POST /api/mail/threads/query) over mail_threads — the active tab's whole FilterGroup (mailbox scope included) compiles through the standard compileWhere path — plus the scalar revision-tick live resource that keeps the loaded window fresh.
- Web:
  - Slots: `mailThreadsPane.Actions`
  - Contributes: `Pane.Register` "mail-threads"
  - Uses:
    - `apps/mail/reading-pane.threadPane`
    - `infra/endpoints.fetchEndpoint`
    - `primitives/css/fill.Fill`
    - `primitives/css/line.Line`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/data-view.DataView`
    - `primitives/data-view.defineDataView`
    - `primitives/live-state.matchResource`
    - `primitives/live-state.useResource`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
    - `primitives/pane.useOpenPane`
    - `primitives/relative-time.RelativeTime`
  - Exports (values): `mailThreadsPane`
- Server:
  - Contributes: `resource.declare` "mail-threads-revision"
  - Uses:
    - `apps/mail/mail-core._mailThreads`
    - `apps/mail/mail-core.resolveMailAccountId`
    - `database.db`
    - `fields/server-capabilities-loader`
    - `fields/server-capabilities.resolveFieldFilterSql`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `primitives/data-view/server-query.compileWhere`
    - `primitives/data-view/server-query.OperatorSqlResolver`
    - `primitives/keyset.buildSortKeys`
    - `primitives/keyset.keyValuesOf`
    - `primitives/keyset.orderByClauses`
    - `primitives/keyset.seekPredicate`
  - Exports (values):
    - `buildThreadsWhere`
    - `handleQuery`
    - `mailThreadsRevisionServerResource`
  - Resources: `mail-threads-revision` (push)
  - Routes: `POST /api/mail/threads/query`
- Core:
  - Uses:
    - `apps/mail/mail-core.MailThreadSchema`
    - `infra/endpoints.defineEndpoint`
    - `primitives/data-view.FilterGroupSchema`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `MailThreadFieldSpec`
    - `MailThreadFieldType`
    - `QueryThreadsBody`
  - Exports (values):
    - `MAIL_THREAD_FIELDS`
    - `mailThreadsRevisionResource`
    - `queryThreads`
    - `QueryThreadsBodySchema`
    - `QueryThreadsResponseSchema`
    - `SortRuleSchema`

<!-- AUTOGENERATED:END -->
