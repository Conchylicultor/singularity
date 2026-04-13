# Plugins

Always READ the plugin architecture doc to understand design, caveats, and rules:

- Frontend: [`plugin-core/CLAUDE.md`](../plugin-core/CLAUDE.md)
- Backend: [`server/CLAUDE.md`](../server/CLAUDE.md)

## Plugin Outline

Quick index of each plugin, the slots/commands it defines, and what it contributes. Keep in sync when adding plugins or slots.

### `shell` — foundational app layout

Defines the slots and commands most other plugins extend.

- **Slots defined**
  - `Shell.Sidebar` — `{ title, icon, onClick?, component?, group? }`
  - `Shell.Toolbar` — `{ label?, icon?, onClick?, component?, group? }`
  - `Shell.Route` — `{ pattern, resolve(params) → PaneDescriptor }`
- **Commands defined**
  - `Shell.OpenPane(PaneDescriptor) → string`
  - `Shell.Toast({ title?, description, variant? })`
- **Contributes**: `Core.Root` → `ShellLayout`

### `welcome`

- Contributes: `Shell.Route` `/` → `welcomePane()`

### `conversations` — conversation domain

Unified plugin: shared server code (tmux, db-fork) in `server/`, shared types in `shared/`, and view plugins under `plugins/`.

- **Server routes**: `GET /api/conversations`, `POST /api/conversations`, `DELETE /api/conversations`
- **Inner plugins** (`plugins/conversations/plugins/*`, registered separately in `web/src/plugins.ts`):
  - `conversation-view` — single-conversation pane.
    - **Slots defined**: `Conversation.Toolbar` — `{ label, icon, onClick(ConversationState) }`
    - Contributes: `Shell.Route` `/c/:id` → `conversationPane({ session_id })`
    - **Sub-plugins** (`.../conversation-view/plugins/*`): nested plugins extending its own slots.
      - `open-app` — `Conversation.Toolbar` "Open" → opens `http://<id>.localhost:9000/`
      - `vscode` — `Conversation.Toolbar` "VSCode" → opens session cwd in VSCode
  - `conversations-view` — sidebar list.
    - Contributes: `Shell.Sidebar` "Conversations" → `ConversationList`

### `logs`

- Contributes: `Shell.Sidebar` button "Logs" (group `System`) → opens logs pane
- **Server routes**: `GET /api/logs/channels`, `WS /ws/logs`

### `worktree-switcher`

- Contributes: `Shell.Toolbar` (group `widgets`) → `WorktreeDropdown`

### `theme`

- Contributes: `Shell.Toolbar` (group `widgets`) → `ThemeToggle`

### `build`

- Contributes: `Shell.Toolbar` (group `actions`) → `BuildButton`
- **Server routes**: `POST /api/build`

### `terminal`

- No web contributions yet. Exposes view factories for terminal panes.
- **Server routes**: `WS /ws/terminal`

### `db-smoketest`

- No web contributions. Smoke-tests the DB schema barrel.
- **Server routes**: `GET /api/smoketest`, `POST /api/smoketest`
- **DB schema**: `plugins/db-smoketest/server/schema.ts`
