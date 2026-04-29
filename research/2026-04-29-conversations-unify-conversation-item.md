# Unify the conversation item visual

## Context

A "conversation" is rendered as a row/chip in many surfaces, and each surface re-implements the same visual: status dot + title + (sometimes) "sys" badge + (sometimes) relative time. The implementations have drifted:

| Surface | File | Status dot | Title | "sys" badge | Time |
|---|---|---|---|---|---|
| Sidebar list | `plugins/conversations/plugins/conversations-view/web/components/conversation-list.tsx` | ✓ inline classes | ✓ | ✓ | ✓ |
| Attempts (task detail) | `plugins/tasks/plugins/task-events/web/components/task-events.tsx` | ✓ via `CONV_STATUS_DOT` | ✓ | ✗ | ✗ (shows status text instead) |
| Inline `conv-<id>` chip | `plugins/active-data/plugins/conv/web/components/conv-chip.tsx` | ✓ via `CONV_STATUS_DOT` | ✓ | ✓ | n/a |
| Attempt-view left panel | `plugins/attempt-view/web/components/attempt-pane.tsx` | ✓ | ✓ | ✗ | ✗ |
| Agent launches | `plugins/agents/web/components/agent-launches.tsx` | ✓ | ✓ | ✗ | ✓ + status text |
| Welcome recent list | `plugins/welcome/web/components/welcome-view.tsx` | ✗ hardcoded different colors | ✓ | ✗ | ✓ |
| Yak tree row | `plugins/yak-shaving/web/components/yak-tree-row.tsx` | ✓ (NODE_STATUS_DOT fallback) | ✓ | ✗ | ✗ (shows context/next-action) |
| Conversations recovery | `plugins/conversations-recover/web/components/recovery-view.tsx` | ✗ | ✓ | ✗ | ✓ + model |

There is no shared component — only the `CONV_STATUS_DOT` constant from `plugins/conversations/web/status-dot.ts` and an inline `formatRelativeTime` in `conversation-list.tsx`. The "sys" badge is duplicated verbatim in two places.

This change introduces a single presentation primitive so every surface looks consistent and future conversation-rendering surfaces have a turnkey component. It also establishes the pattern we'll follow for other domain entities (tasks, attempts, pushes…).

## Design

### Recommendation: a `ConversationItem` presentation component plus a few atoms

Live in `plugins/conversations/web/components/conversation-item.tsx`, exported from `@plugins/conversations/web` next to `CONV_STATUS_DOT`. **Pure visual** — no click handler, no router awareness, no data fetching, no chrome. Surfaces wrap it in their own button / link / menu chrome.

```tsx
type ConversationItemProps = {
  conv: Conversation;        // ConversationEntry from useConversations()
  layout?: "block" | "inline"; // default "block"
  active?: boolean;          // emphasize title (font-medium)
};
```

**`layout="block"` (default)** — used by sidebar, Attempts, and any list row.
- Row 1: status dot · title · sys badge
- Row 2 (meta): relative time (with "spawnedBy · …" prefix when system)

**`layout="inline"`** — used by `conv-chip` and any inline pill.
- Single line: status dot · title · sys badge. No time.

### Atoms (also exported for one-off compositions)

Co-located in the same file:

- `<ConvStatusDot conv={c} />` — the dot, sized for inline contexts (`size-1.5 rounded-full` + `CONV_STATUS_DOT[status]`).
- `<ConvSysBadge conv={c} />` — renders the "sys" pill iff `kind === "system"`. Returns `null` otherwise.
- `<ConvTitle conv={c} active={active} />` — title with `"Starting…"` fallback and the truncate/font behavior.
- `<ConvRelativeTime conv={c} />` — meta line. Includes the `spawnedBy · …` prefix when system. Uses an exported `formatRelativeTime(date)` util.

`ConversationItem` is built from these atoms. Yak tree row and welcome can keep their custom layouts but switch to the atoms (e.g. drop welcome's hardcoded colors in favor of `<ConvStatusDot>`).

### Why this shape, and the pattern it sets

1. **Presentation, not chrome.** Each surface keeps its own click behavior (`SidebarMenuButton`, custom `<button>`, inline `<button>` for the chip). The component renders only the conversation's *visual identity*.
2. **Atoms + composed default.** Surfaces with one of two common layouts (block / inline) get a one-line drop-in. Unusual surfaces (yak, welcome, recovery) compose atoms directly.
3. **Lives in the conversations plugin.** Visual identity for a `Conversation` belongs alongside its types/hooks/CONV_STATUS_DOT — same import path teams already use.
4. **Pattern to reuse for other entities.** Same recipe for `TaskItem`, `AttemptItem`, `PushItem`: presentation primitive + atoms in the owning plugin's `web/components/`, surfaces wrap chrome around it. This is the convention the repo currently lacks.

### Files to change

**New:**
- `plugins/conversations/web/components/conversation-item.tsx` — `ConversationItem`, `ConvStatusDot`, `ConvSysBadge`, `ConvTitle`, `ConvRelativeTime`, `formatRelativeTime`.

**Updated barrel:**
- `plugins/conversations/web/index.ts` — re-export `ConversationItem` and the atoms.

**Migrate (the three surfaces named in the task):**
- `plugins/conversations/plugins/conversations-view/web/components/conversation-list.tsx`
  - Delete local `formatRelativeTime`, `statusDotClass`, `ConversationContent`. Replace with `<ConversationItem conv={c} active={c.active} />`. Keep `rowTint`, `SidebarMenuButton`, `SidebarMenuAction`, `MdClose` chrome — only the inner content changes.
- `plugins/tasks/plugins/task-events/web/components/task-events.tsx`
  - Replace the inline conversation row (lines 177–214) with `<ConversationItem conv={c} active={isActive} />`. Drop the trailing status-text span — time replaces it as the meta line. Keep the surrounding `<button>` + active highlight.
- `plugins/active-data/plugins/conv/web/components/conv-chip.tsx`
  - Replace the inline status-dot + title + sys-badge content with `<ConversationItem conv={conv} layout="inline" />`. Keep the `<button>` shell, `onClick` routing logic, and the `title` tooltip. Falls back to a tiny inline-id placeholder when `conv` is `null` (id pre-populated, conversation not yet in the index).

**Atom-only follow-ups (recommended, low risk):**
- `plugins/attempt-view/web/components/attempt-pane.tsx` → `<ConversationItem layout="inline" conv={c} active={selected} />`.
- `plugins/agents/web/components/agent-launches.tsx` → `<ConversationItem layout="block" conv={primary} />`. The launch timestamp it currently shows duplicates `createdAt`, so the unified meta line replaces both the status-text and the launch-time span.

**Out of scope for this pass** (significantly different layouts; flag as future work):
- `plugins/yak-shaving/web/components/yak-tree-row.tsx` — multi-line context/next-action row.
- `plugins/welcome/web/components/welcome-view.tsx` — uses hardcoded colors; switch to `<ConvStatusDot>` at minimum.
- `plugins/conversations-recover/web/components/recovery-view.tsx` — model + ended-time variant.

## Verification

1. `./singularity build` from the worktree — frontend type-checks and the bundle rebuilds.
2. Open `http://att-1777459694-hrsy.localhost:9000`.
3. **Sidebar list** — same visual as today (status dot, title, sys, time, spawnedBy line for system rows). Toggle "show system" — system rows still tinted and labeled "sys".
4. **Attempts under a task** — open a task in the Tasks pane. Each conversation row now shows the status dot, title, sys badge, and relative time (instead of the status text).
5. **Inline conv chip** — open a conversation that contains a `conv-<id>` mention. The chip shows status dot + title + sys, no time. Clicking still opens the side pane (or full screen when self-referencing/out-of-context).
6. Optional Playwright sweep with `bun e2e/screenshot.mjs --url http://att-1777459694-hrsy.localhost:9000/c/<id>` to capture before/after of the chip + sidebar.

## Critical files

- `plugins/conversations/web/index.ts` (barrel — must re-export new symbols)
- `plugins/conversations/web/status-dot.ts` (existing primitive — kept as-is, used internally by `ConvStatusDot`)
- `plugins/conversations/web/components/conversation-item.tsx` (new)
- `plugins/conversations/plugins/conversations-view/web/components/conversation-list.tsx`
- `plugins/tasks/plugins/task-events/web/components/task-events.tsx`
- `plugins/active-data/plugins/conv/web/components/conv-chip.tsx`
