# Conversations runtime abstraction — remaining work

Tracks follow-ups from the original request ("detect Claude running/idle state and session id; design an abstraction so a future API mode can coexist with tmux mode").

Design docs:
- [v1](./2026-04-14-plugins-conversations-runtime-abstraction.md)
- [v2 (implemented)](./2026-04-14-plugins-conversations-runtime-abstraction-v2.md)

## Done

- [x] `ConversationRuntime` interface + `Runtime` registry (`plugins/conversations/server/api.ts`).
- [x] tmux runtime extracted into `plugins/conversations/plugins/runtime-tmux/`.
- [x] API runtime stub in `plugins/conversations/plugins/runtime-api/` (registers id `"api"`, methods throw).
- [x] DB columns `runtime` + `claude_session_id` with migration.
- [x] Poller iterates `Runtime.all()`; writes `title` + `claudeSessionId` to DB.
- [x] `~/.claude/sessions/<pid>.json` resolver with per-pid cache (checks pane_pid directly, falls back to children).
- [x] SSE events split: `idle`, `gone`, `claude-session`, `title` (each a single purpose).
- [x] Web consumers (`conversation-list`, `welcome-view`, `stream/client`) updated to the new events.
- [x] Lifecycle orchestration in `internal/lifecycle.ts`; worktree helpers in `internal/worktree.ts`.

## Open

### Short-term

- [ ] **Surface `claudeSessionId` in the UI.** Add a "Copy session id" / "Open transcript" affordance in the conversation toolbar (`Conversation.Toolbar`). Transcript path: `~/.claude/projects/<slug-cwd>/<sessionId>.jsonl`.
- [ ] **Drive `conversation.status` from runtime state.** The `status` badge plugin already renders the column, but the column is still hard-coded to `"starting"` at insert time and never transitions. Wire idle/active → `completed`/`working` in the poller (see `research/2026-04-13-plugins-conversation-status-toolbar.md` for the intended transitions).
- [ ] **Orphan adoption: infer the right runtime.** Orphans are currently adopted as `runtime = <whichever runtime returned them>` — that works for tmux. Once multiple runtimes exist, re-check this logic (an id should only ever be claimed by one runtime).

### API runtime (the main follow-up)

- [ ] **Implement `runtime-api`** against the Anthropic Agent SDK. Methods to flesh out in `plugins/conversations/plugins/runtime-api/server/index.ts`:
  - `create(id, worktreePath)` — start a session, persist its sdk-side handle somewhere durable (in-process map is fine to start, DB-backed later if we need restart survival).
  - `list()` — return `{title, idle, claudeSessionId}` per live session. `idle` comes from SDK "waiting for input" signal; `title` from the last user/assistant turn or agent-reported status.
  - `delete(id)` — stop the session.
- [ ] **Conversation creation UX.** Today `POST /api/conversations` defaults to `runtime = "tmux"`. Decide how the user picks: query param (`?runtime=api`), settings toggle, or per-conversation dropdown in `ConversationList`'s "New conversation" button. Keep tmux as the default.
- [ ] **Cross-runtime id collision.** `listPanes()` scopes to `claude-*` session names. If the API runtime uses a different id scheme, no collision. If not, namespace each runtime's ids (e.g. `claude-api-<ts>`).

### Nice-to-have

- [ ] **Transcript `mtime` as a corroborating active signal.** `pane_title` spinner is enough today; revisit only if false-idle reports appear. Path: `~/.claude/projects/<slug-cwd>/<sessionId>.jsonl`.
- [ ] **Evict stale `pidCache` entries** in `runtime-tmux/server/internal/claude-session.ts`. The cache grows by one entry per pid forever. Prune on pids no longer seen in the latest `listPanes()` output.
- [ ] **Document the runtime API** in a short `plugins/conversations/server/README.md` (how to register a runtime, what contract methods must satisfy). Will be useful when the API runtime ships.
