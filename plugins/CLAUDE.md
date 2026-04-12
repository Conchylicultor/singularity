# Plugins

Always READ the plugin architecture doc to understand design, caveats, and rules:

- Frontend: [`plugin-core/CLAUDE.md`](../plugin-core/CLAUDE.md)
- Backend: [`server/CLAUDE.md`](../server/CLAUDE.md)

## Plugin Outline

Quick index of each plugin, the slots/commands it defines, and what it contributes. Keep in sync when adding plugins or slots.

### `shell` — foundational app layout

Defines the slots and commands most other plugins extend.

- **Slots defined**
  - `Shell.Sidebar` — `{ title, icon, component }`
  - `Shell.Toolbar` — `{ label?, icon?, onClick?, component?, group? }`
  - `Shell.Route` — `{ pattern, resolve(params) → PaneDescriptor }`
- **Commands defined**
  - `Shell.OpenPane(PaneDescriptor) → string`
  - `Shell.Toast({ title?, description, variant? })`
- **Contributes**: `Core.Root` → `ShellLayout`

### `welcome`

- Contributes: `Shell.Route` `/` → `welcomePane()`

### `conversation`

- **Slots defined**: `Conversation.Toolbar` — `{ label, icon, onClick(ConversationState) }`
- Contributes: `Shell.Route` `/c/:id` → `conversationPane({ session_id })`
- **Sub-plugins** (`plugins/conversation/plugins/*`): nested plugins that extend the parent's own slots. Registered separately in `web/src/plugins.ts`.
  - `open-app` — `Conversation.Toolbar` "Open" (`MdOpenInNew`) → opens `http://<id>.localhost:9000/`
  - `vscode` — `Conversation.Toolbar` "VSCode" (`MdCode`) → opens session cwd in VSCode

### `conversations`

- Contributes: `Shell.Sidebar` "Conversations" (`MdSmartToy`) → `ConversationList`

### `logs`

- Contributes: `Shell.Sidebar` "Logs" (`MdSubject`) → `LogsSidebar`

### `worktree-switcher`

- Contributes: `Shell.Toolbar` (group `widgets`) → `WorktreeDropdown`

### `theme`

- Contributes: `Shell.Toolbar` (group `widgets`) → `ThemeToggle`

### `build`

- Contributes: `Shell.Toolbar` (group `actions`) → `BuildButton`

### `terminal`

- No web contributions yet (server/shared only). Exposes view factories for terminal panes.
