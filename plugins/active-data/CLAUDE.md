# active-data

Meta plugin for inline interactive widgets rendered inside assistant text.
Sub-plugins under `plugins/active-data/plugins/<name>/` ship the component
that renders one widget kind.

Each contribution declares a `display` mode:

- **`display: 'inline'`** — agent emits a recognizable raw substring (e.g.
  `conv-1777406728-mb12`) and the host replaces it with the component at
  render time. Built ONLY via `inlineChip()` (see below). The component
  receives `content` (the matched substring) and `attrs` (always `{}`).
- **`display: 'block'`** — agent wraps content in `<tag>…</tag>`. The host
  pre-extracts these before markdown parsing, so blank lines inside the tag
  body are handled correctly. Requires `tag: string`. The component receives
  `content` (trimmed inner text) and `attrs` (parsed tag attributes).
- **`display: 'code'`** — like inline, but applied only inside backtick-wrapped
  inline code spans, never to regular text nodes. Two gates, and a claim protocol
  between them — see below.

## `display:'code'` — the claim protocol

`pattern` is only the **syntactic** gate; several contributions legitimately
full-match one token (a short sha is also a valid plugin name). The **semantic**
gate is `useClaim`, sealed to its renderer by `codeTag()`:

```ts
ActiveData.Tag(codeTag({
  id: "plugin-link",
  pattern: PLUGIN_NAME_RE,
  useClaim: usePluginClaim,   // (text) => CodeClaim<PluginNode>
  component: PluginLinkChip,  // ({ content, value: PluginNode }) — pure renderer
}))
```

`CodeClaim<T>` (`web/claim.ts`): `claimPending()` / `declined(reason)` /
`claimed(value)`. `internal/code-chain.tsx` walks the syntactic candidates and
renders the first that claims — on `declined` it moves on, on `pending` it renders
the plain terminal `<code>` and **stops** (walking past a loading candidate would
fire the next one's I/O for an answer about to be discarded, then flicker).

Rules that look optional and aren't:

- **No contribution renders its own plain `<code>`.** A rendered fallback is
  indistinguishable from a success, so it starves every other candidate for the
  token. The host owns the fallback (`<InlineCode>`); `./singularity check
  active-data:no-adhoc-inline-code` enforces it.
- **The chain reads the registry itself, never a candidates prop** — the markdown
  renderer memoizes its whole element, so a prop freezes a boot-time snapshot in.
- **`display:'inline'` has no claim protocol and must stay self-certifying.**
  Every inline pattern is unioned into ONE Lexical node, so a "declined" inline
  token would still be a committed node in the user's document with no host to
  catch it. A pattern whose validity needs I/O goes in `display:'code'`.

Hosts wire two helpers:

- `useActiveDataSegments(rawText)` — splits the raw string into `markdown`
  segments (passed to `<ReactMarkdown>`) and `block` segments (rendered
  directly as the contributed component, outside the markdown pipeline).
- `useActiveDataLinkify()` — returns a function that walks a rendered
  ReactNode tree and splices in inline-pattern components. Call it from inside
  the host's react-markdown `transform` helper. Skips `code`/`pre`/`a` and
  custom components.

Renderers needing the host conversation read it via
`conversationPane.useData()` directly; the slot does not pipe it.

## One chip declaration, one registry, every surface

An inline chip is declared exactly once, and `inlineChip()` is the only thing
that can build one (`web/internal/inline-registry.ts`):

```ts
ActiveData.Tag(inlineChip({
  id: "attempt",                          // names the chip in its error boundary + the docs
  pattern: ATTEMPT_ID_RE,
  surfaces: ["transcript", "document"],   // REQUIRED — no default
  component: AttemptChip,
}))
```

`ActiveData.Tag` stays the DECLARATION surface — it is what puts the chip in
`docs/plugins-details.md` and the reverse index — while `inlineChip` also
records the chip in a **module registry**. Both halves are sealed in one call,
the way `codeTag()` seals a code contribution's claim to its renderer, and the
`display:"inline"` arm carries an unexported symbol brand: hand-writing
`ActiveData.Tag({ display: "inline", … })` is a tsc error.

**Why a module registry when the slot is already one.** Slot contributions are
readable only through a React hook (`bySlot` is built inside `PluginProvider`'s
`useMemo`), so every reader that is not a render — the Lexical hosts' headless
registries, the runs↔doc projection — cannot see them at all.

Three reads, and no way to get a raw `component` out:

| read | answers |
|---|---|
| `inlineChips(surface)` | the chips that declared this surface |
| `activeDataInlineExtension(surface)` | those chips' patterns as ONE token extension a Lexical host registers |
| `renderInlineChip(token)` | the chip that owns these characters, inside its boundary — or `null` |

All three read the registry at **call time**. Chips register progressively as
the plugin tiers load, so a snapshot taken too early silently under-reports and
its tokens render as plain characters with nothing failing.

`renderInlineChip` returning `null` for an unclaimed token is load-bearing, not
defensive: it is what lets a document holding a chip node still hydrate and read
correctly in a composition without the chip's own plugin.

### `surfaces` — where a chip belongs, declared by the chip

`"transcript"` is conversation surfaces (assistant markdown, user text, the
prompt editor); `"document"` is page content. Required, with no default, because
this is how a chip that has no business in a page stays out of Pages **without
any consumer naming a contributor** — the host asks for its own surface and gets
exactly the chips that said yes. `<ui-context>` is a pointer at a live UI
element addressed to one agent turn; `block-…` would compete with the page
editor's own `[[page:<id>]]` token for the same span. Both are transcript-only.

Two hosts ask: the prompt editor for `"transcript"`, the page editor for
`"document"`. Each gets a different union from the same declarations.

**Declaring `"document"` is a promise with a server half**, and
`./singularity check active-data:document-chip-has-server-token` collects on it.
A page block's content doc can now hold that chip's decorator node, and the
server REFUSES to read a block holding a decorator type it has no registered
node for (`markdown-apply`'s `readStateRuns`) — so a chip with no
`Editor.InlineToken` contribution renders perfectly and then breaks an agent's
first `edit_page` on any block containing it, somewhere else entirely. The check
enumerates the chips and the server contributions generically and joins them on
the pattern source, so a fifth chip is covered the day it declares the surface.

### The editor half

`activeDataInlineExtension(surface)` unions every one of that surface's patterns
into a single generic node, which stores the raw matched substring, resolves its
chip at decorate time, and serializes back to that substring (so copy/paste and
markdown sync round-trip). Both hosts get it as a LOOKUP, not a list
(`registerNodeExtensionSource` / `registerBlockTextExtensionSource`), so the
union is recompiled per read rather than frozen at the moment active-data
loaded. Declaring one chip lights the token up on **every** surface with no
per-chip Lexical wiring. (This is how the element-picker `<ui-context>` chip is
defined; it owns no Lexical node of its own.)

**The node spec is `core/node.ts`, not the web file.** The browser's twin is
`activeDataInlineNode.decorated({…})` and each sub-plugin's SERVER barrel
contributes that same object to `page/editor`'s `Editor.InlineToken`. One object,
so the two runtimes cannot name a different type string, fields or token format —
which is what lets an agent read and `edit_page` a page block holding a chip
instead of being refused.

### An unsealed chip has no boundary, so it is given one back

Every other slot component reaches the screen through `slot-render`, whose
middleware wraps it in `PluginErrorBoundary`. An inline chip cannot: it is
spliced into a foreign ReactNode tree, so it is rendered straight from the
module registry and arrives naked — and nothing says so, because the chip
renders fine right up until one throws.

`renderInlineChip` therefore applies `<ChipBoundary>`
(`internal/chip-boundary.tsx`) INSIDE itself, which is what makes an
unboundaried chip unreachable: there is no way to get the component out. It
wraps the ELEMENT, never the component type — a wrapper minted per render
remounts the chip on every keypress. Without it, a chip that throws in the
editor is caught by Lexical's own boundary, whose stock fallback blanks the
entire content region into a red "An error was thrown." box, names no plugin,
and files no report.

The boundary is labelled with the chip's own `id`, not `_pluginId`:
`PluginProvider` stamps that onto a COPY of each contribution, and the object in
the module registry is the pre-copy original.

## Persisting widget state — `useActiveDataBinding`

Block widgets often have follow-up state — a task was created, a conversation
was launched. Component-local `useState` resets on reload because the
assistant text re-renders fresh each mount. The binding primitive persists
per-widget payload server-side, keyed by
`(conversationId, messageId, tag, occurrenceIndex)`.

The host renderer wraps each block segment in
`<ActiveDataIdentityProvider conversationId messageId tag occurrenceIndex>`
(JSONL `assistant-text-row` does this — `messageId` is Claude's per-event
uuid, `occurrenceIndex` is the count of prior block segments with the same
tag in the message). Inside the contributed component:

```ts
const TaskBindingSchema = z.object({ taskId: z.string() });
const binding = useActiveDataBinding(TaskBindingSchema);

if (binding.enabled && binding.pending) return null;  // avoid flashing the editable card
const value = binding.pending ? null : binding.value;
if (value?.taskId) return <TaskChip taskId={value.taskId} />;
// ... otherwise render the editable card; call binding.set({ taskId }) on action
```

Behavior:

- One push resource per conversation, so all widgets in a conversation share
  one subscription.
- `set` upserts via `PUT /api/active-data/bindings/...`; `clear` deletes.
- When `messageId` is absent (legacy logs), `enabled` is `false` and `set` /
  `clear` no-op — the widget falls back to non-persistent React state.
- Cascades on conversation delete; no GC sweep needed.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Meta plugin for inline interactive widgets agents render via XML-like tags in assistant text. Sub-plugins contribute inline (pattern) or block (tag) renderers; hosts use useActiveDataSegments() + useActiveDataLinkify(). Persistent state for inline interactive widgets — table + resource keyed by (conversationId, messageId, tag, occurrenceIndex).
- Web:
  - Slots: `ActiveData.Tag` ← `active-data.attempt`, `active-data.commit-link`, `active-data.conv`, `active-data.page-link`, `active-data.plugin-link`, `active-data.prototype`, `active-data.task`, `active-data.task-link`, `improve.element-picker`
  - Contributes:
    - `MarkdownEnhancerSlot`
    - `InlineTextWalkerSlot`
  - Uses:
    - `infra/endpoints.EndpointError`
    - `infra/endpoints.fetchEndpoint`
    - `page/editor.blockTextTokenExtension`
    - `page/editor.registerBlockTextExtensionSource`
    - `primitives/css/center.Center`
    - `primitives/css/inline.Inline`
    - `primitives/css/pin.Pin`
    - `primitives/css/ui-kit.cn`
    - `primitives/error-boundary.PluginErrorBoundary`
    - `primitives/hover-reveal.hoverRevealGroup`
    - `primitives/hover-reveal.hoverRevealTarget`
    - `primitives/inline-text.InlineTextWalker`
    - `primitives/inline-text.InlineTextWalkerContext`
    - `primitives/inline-text.InlineTextWalkerSlot`
    - `primitives/inline-text.useInlineTextWalker`
    - `primitives/live-state.useResource`
    - `primitives/markdown.InlineCode`
    - `primitives/markdown.MarkdownEnhancement`
    - `primitives/markdown.MarkdownEnhancementContext`
    - `primitives/markdown.MarkdownEnhancerSlot`
    - `primitives/markdown.useMarkdownEnhancement`
    - `primitives/text-editor.registerNodeExtensionSource`
  - Exports (types):
    - `ActiveDataBindingHandle`
    - `ActiveDataBlockContribution`
    - `ActiveDataCodeContribution`
    - `ActiveDataContribution`
    - `ActiveDataIdentity`
    - `ActiveDataInlineContribution`
    - `ActiveDataSegment`
    - `ChipSurface`
    - `CodeClaim`
    - `CodeResolver`
  - Exports (values):
    - `ActiveData`
    - `ActiveDataIdentityProvider`
    - `activeDataInlineExtension`
    - `claimed`
    - `claimPending`
    - `codeTag`
    - `declined`
    - `inlineChip`
    - `inlineChips`
    - `renderInlineChip`
    - `useActiveDataBinding`
    - `useActiveDataIdentity`
    - `useActiveDataLinkify`
    - `useActiveDataSegments`
- Server:
  - Contributes: `resource.declare` "active-data.bindings"
  - Uses:
    - `database.db`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `tasks/tasks-core._conversations`
  - DB schema: `plugins/active-data/server/internal/tables.ts`
  - Exports (values):
    - `_activeDataBindings`
    - `activeDataBindingsResource`
  - Resources: `active-data.bindings` (push)
  - Routes:
    - `PUT /api/active-data/bindings/:conversationId/:messageId/:tag/:occurrenceIndex`
    - `DELETE /api/active-data/bindings/:conversationId/:messageId/:tag/:occurrenceIndex`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `primitives/live-state.resourceDescriptor`
    - `primitives/text-editor/token-extension/node.defineInlineTokenNode`
  - Exports (types):
    - `ActiveDataBinding`
    - `ActiveDataBindingsPayload`
    - `ActiveDataInlineFields`
    - `PutBindingBody`
  - Exports (values):
    - `ActiveDataBindingSchema`
    - `ActiveDataBindingsPayloadSchema`
    - `activeDataBindingsResource`
    - `activeDataInlineNode`
    - `deleteBinding`
    - `inlineBoundary`
    - `putBinding`
    - `putBindingBodySchema`
- Cross-plugin:
  - Imported by:
    - `active-data/attempt`
    - `active-data/commit-link`
    - `active-data/conv`
    - `active-data/page-link`
    - `active-data/plugin-link`
    - `active-data/prototype`
    - `active-data/task`
    - `active-data/task-link`
    - `conversations/conversation-view/jsonl-viewer/assistant-text`
    - `improve/element-picker`
- Sub-plugins:
  - **`attempt`** — Renders raw `att-<id>` strings inline as clickable chips that open the attempt pane. Models emit the bare id, no tag wrapping needed. The attempt-id token at the page-editor's server boundary: locates `att-<id>` spans and names the shared active-data inline node, so a page block holding one of these chips stays agent-readable and agent-editable. Declares itself markdown-TRANSPARENT — a bare id has no character the inline scan could misread.
  - **`commit-link`** — Renders commit shas in backtick-wrapped inline code as clickable chips that open the commit-detail pane, with the subject, author and date on hover. Resolves the sha against the main checkout's object database and declines when it names no commit.
  - **`conv`** — Renders raw `conv-<id>` strings inline as clickable chips that open the referenced conversation in the right side pane alongside the host conversation. Models emit the bare id, no tag wrapping needed. The conversation-id token at the page-editor's server boundary: locates `conv-<id>` spans and names the shared active-data inline node, so a page block holding one of these chips stays agent-readable and agent-editable. Declares itself markdown-TRANSPARENT — a bare id has no character the inline scan could misread.
  - **`page-link`** — Renders raw `block-<id>` strings inline as clickable chips that open the page displaying that block in the page-detail pane. Models emit the bare id, no tag wrapping needed.
  - **`plugin-link`** — Renders plugin IDs in backtick-wrapped inline code as clickable chips that open the plugin-view pane. Models emit the plugin's dotted id (e.g. `tasks`, `active-data.conv`) and the chip validates and resolves it at render time.
  - **`prototype`** — Renders raw `proto-<id>` strings inline as clickable chips that open the mock in the prototype-detail pane. Models emit the bare id, no tag wrapping needed. The prototype-id token at the page-editor's server boundary: locates `proto-<id>` spans and names the shared active-data inline node, so a page block holding one of these chips stays agent-readable and agent-editable. Declares itself markdown-TRANSPARENT — a bare id has no character the inline scan could misread.
  - **`task`** — Renders <task>prompt</task> tags as editable cards with Create + Launch actions. Models suggest tasks inline; users tweak and act without leaving the transcript.
  - **`task-link`** — Renders raw `task-<id>` strings inline as clickable chips that open the task detail pane. Models emit the bare id, no tag wrapping needed. The task-id token at the page-editor's server boundary: locates `task-<id>` spans and names the shared active-data inline node, so a page block holding one of these chips stays agent-readable and agent-editable. Declares itself markdown-TRANSPARENT — a bare id has no character the inline scan could misread.

<!-- AUTOGENERATED:END -->
