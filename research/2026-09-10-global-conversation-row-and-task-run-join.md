# One conversation navigation, one task→runs join

**Date:** 2026-09-10
**Status:** plan

## The problem

Six surfaces render "a conversation, clickable, opening its run". Two of them
(the `/prompt` block's chips and the TODO card's foot) already share
`ConversationChip`. The other four each hand-roll a `Row` + their own
`openPane(conversationPane, …, { mode: "push" })` + their own idea of which
conversation is "the open one":

| surface | shape | active-state rule |
| --- | --- | --- |
| `tasks/task-events` (TaskAttempts) | `Row`, block | `entries.length > 1 ? last : null` |
| `active-data/task` (LaunchedAttempts) | `Row`, block | `entries.length > 1 ? last : null` |
| `page/annotations/agent-notes/authorship` (AuthorRow) | `Row`, inline, by id | none |
| `page/annotations/todo/task-link` (LatestRun) | `Row`, inline | none |
| `active-data/conv` (`conv-<id>` token) | `LinkChip`, by id | none |
| `conversation-ui/chip` (`ConversationChip`) | `ToggleChip` | `entries.at(-1)` |

Three of those rules are different, and **two of them are wrong**:

- `length > 1 ? last : null` answers "no conversation is open" whenever the
  surface's own pane was NOT itself opened from a conversation. Open a task from
  the task list, click one of its runs: the run opens, but its row never lights
  up and clicking it again does not close it.
- `.at(-1)` answers "the deepest conversation in the route". A page chip that
  opened conversation A stops being active the moment A opens B beside it, even
  though A's column is still on screen.

The rule everybody is approximating is **"the conversation column *I* opened"** —
the first `conversationPane` entry that sits *after the calling pane* in the
route chain. That is not expressible today, which is why each site invented a
heuristic instead.

Separately, five places re-derive "the attempts of a task" / "the runs a task
produced" off the global `attemptsResource` with their own filter + sort +
flatMap, and they do not even agree on the sort direction (two newest-first, two
oldest-first, one unsorted).

## The design

Four layers, each owning exactly one of the duplicated decisions.

### 1. `pane.useOpenedHere()` — the active-state rule (pane primitive)

`PaneObject` gains:

```ts
/**
 * The instance of this pane that the CALLING surface opened: the first entry
 * for this pane that sits AFTER the caller's own pane in the route chain.
 */
useOpenedHere(): PaneRouteEntry<OwnParams> | null
```

The pane primitive already knows both halves — `usePaneMatch()` is the ordered
chain and `PaneInstanceContext` is the caller's own instance — they were just
never joined. With the exact answer available, neither heuristic has a reason to
exist. A caller rendered outside any pane instance (global chrome) reads the
whole chain as "after me" and gets the first entry.

`useRouteEntry()` / `useRouteEntries()` stay: "is this pane anywhere in the
route" is a different question, and the sidebar's "which conversation is the
user reading" genuinely wants the deepest one, not the one it opened.

### 2. `useConversationOpener()` — the navigation (conversations/conversation-view)

Lives next to `conversationPane`, the thing it drives:

```ts
export interface ConversationOpener {
  /** The conversation column this surface has open, if any. */
  openConvId: string | null;
  isOpen(convId: string): boolean;
  /** Open it beside this surface — or close it, when it is the one open. */
  toggle(convId: string): void;
  /** Open it as this surface's own page. */
  openAsPage(convId: string): void;
}
export function useConversationOpener(): ConversationOpener;
```

`mode: "push"` and `mode: "root"` are spelled once. Toggle-close becomes the one
behaviour everywhere: today two surfaces close on a second click and four do not,
for no reason a user could name.

### 3. `ConversationRow` — the row widget (conversation-ui/plugins/row)

The `Row`-shaped sibling of `ConversationChip`, same charter: `item` is pure
presentation, and this is the wrapper for the row case, written once.

```tsx
<ConversationRow conv={conv} layout="block" | "inline" trailing? actions? onOpen? />
<ConversationRowById convId={id} … />   // for a surface holding only an id
```

- `layout` states density once and drives both `ConversationItem`'s layout and
  the `Row`'s `size`/`hover` — a caller says "inline", not `size="sm"
  hover="muted"`.
- `trailing` is presentational (the authorship row's "when it first wrote here"
  time); `actions` is `Row`'s interactive slot (task-events' "Open as page").
- `onOpen` lets a popover dismiss itself after navigating.
- `ConversationRowById` resolves the id and, while it is unresolved (loading, or
  a conversation that outlived its record), renders the muted id — still
  clickable, because the common unresolved state is "still loading".

### 4. `useTaskAttempts` / `useTaskConversations` — the join (tasks/tasks-core/web)

The plugin that owns `attemptsResource` owns how it is read:

```ts
/** This task's attempts, newest first. */
useTaskAttempts(taskId: string): ResourceResult<readonly AttemptWithConversations[]>
/** Every run these tasks produced, oldest first. */
useTaskConversations(taskIds: readonly string[]): ResourceResult<readonly ConversationSummary[]>
```

Both run as a `select`, so a surface re-renders when ITS OWN task's runs change
rather than on every push to the global attempts list. Both hand back the
`ResourceResult`, never a collapsed `[]` — "still loading" and "this task has no
runs" are different answers and each caller renders them its own way.

The two orders are deliberate and opposite: an attempt list reads newest-first
(the current attempt at the top), a run timeline reads oldest-first (the order
they were started). Naming them separately is what keeps that from being a
per-call-site coin flip.

## Call-site changes

| file | change |
| --- | --- |
| `primitives/pane/web/pane.ts` | add `useOpenedHere()` |
| `conversations/conversation-view/web` | add `useConversationOpener()` |
| `conversation-ui/item/web` | export `conversationTitle(conv)`; `ConvTitle` uses it |
| `conversation-ui/row` | **new plugin** |
| `conversation-ui/chip` | rebuilt on `useConversationOpener()` |
| `tasks/tasks-core/web` | add the two hooks |
| `tasks/task-events` | shared hook + `ConversationRow`, drop local `useTaskAttempts` |
| `active-data/task` | shared hook + `ConversationRow` |
| `active-data/conv` | `useConversationOpener().toggle` |
| `agent-notes/authorship` | `ConversationRowById` |
| `todo/task-link` | shared hook + `ConversationRow`, drop `useTodoTaskConversations` |
| `page/prompt/block` | shared hook |

## Deliberately not done

- **The sidebar conversation list** (`conversations-view`) and the **attempt
  pane** keep their own `useRouteEntries()` reads. They ask "which conversation
  is the user reading", not "which one did I open" — the deepest column, not the
  one below this surface. Folding them into `useOpenedHere()` would change what
  they highlight.
- **`active-data/conv`'s chip stays a `LinkChip`**, not a `ConversationChip`. It
  sits in running prose and carries an unknown-id fallback; only its navigation
  is shared. Same for the `Row` sites: they stay rows, because turning them into
  chips is a look change, not a de-duplication.
- **`attemptsResource` stays unbounded.** It is a boot-critical global load with
  no `LIMIT`; centralising the join does not fix that, and doing so is a resource
  migration of its own (`research/2026-07-18-global-bounded-working-set-resource-contract.md`).
