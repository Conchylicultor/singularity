# active-data

Meta plugin for inline interactive widgets rendered inside assistant text.
Sub-plugins under `plugins/active-data/plugins/<name>/` ship the component
that renders one widget kind.

Each contribution declares a `display` mode:

- **`display: 'inline'`** — agent emits a recognizable raw substring (e.g.
  `conv-1777406728-mb12`) and the host replaces it with the component at
  render time. Requires `pattern: RegExp` (with `g` flag). The component
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
  `node-extension-bridge.ts` unions every inline pattern into one Lexical node, so
  a "declined" inline token would still be a committed node in the user's document
  with no host to catch it. A pattern whose validity needs I/O goes in
  `display:'code'`.

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

## Editor bridge — inline tags render while composing too

`display:'inline'` contributions also render as chips **inside the Lexical
editor**, not only on read surfaces. `internal/node-extension-bridge.ts`
contributes a single `TextEditorSlots.NodeExtensions` source that mirrors the
inline registry into the editor: a union of every inline `pattern` feeds one
generic `ActiveDataInlineNode` (`internal/active-data-inline-node.tsx`), which
stores the raw matched substring, resolves the matching contribution at decorate
time, and serializes back to that substring (so copy/paste and markdown sync
round-trip). The upshot: registering one inline contribution lights the token up
on **every** surface — compose editor + assistant markdown + user-text — with no
per-tag Lexical wiring. (This is how the element-picker `<ui-context>` chip is
defined; it owns no Lexical node of its own.)

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
  - Slots: `ActiveData.Tag` ← `active-data.attempt`, `active-data.commit-link`, `active-data.conv`, `active-data.page-link`, `active-data.plugin-link`, `active-data.task`, `active-data.task-link`, `improve.element-picker`
  - Contributes:
    - `MarkdownEnhancerSlot`
    - `InlineTextWalkerSlot`
    - `TextEditorSlots.NodeExtensions`
  - Uses:
    - `infra/endpoints.EndpointError`
    - `infra/endpoints.fetchEndpoint`
    - `primitives/css/center.Center`
    - `primitives/css/inline.Inline`
    - `primitives/css/pin.Pin`
    - `primitives/css/ui-kit.cn`
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
    - `primitives/text-editor.TextEditorSlots`
  - Exports (types):
    - `ActiveDataBindingHandle`
    - `ActiveDataBlockContribution`
    - `ActiveDataCodeContribution`
    - `ActiveDataContribution`
    - `ActiveDataIdentity`
    - `ActiveDataInlineContribution`
    - `ActiveDataSegment`
    - `CodeClaim`
    - `CodeResolver`
  - Exports (values):
    - `ActiveData`
    - `ActiveDataIdentityProvider`
    - `claimed`
    - `claimPending`
    - `codeTag`
    - `declined`
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
  - Exports (types):
    - `ActiveDataBinding`
    - `ActiveDataBindingsPayload`
    - `PutBindingBody`
  - Exports (values):
    - `ActiveDataBindingSchema`
    - `ActiveDataBindingsPayloadSchema`
    - `activeDataBindingsResource`
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
    - `active-data/task`
    - `active-data/task-link`
    - `conversations/conversation-view/jsonl-viewer/assistant-text`
    - `improve/element-picker`
- Sub-plugins:
  - **`attempt`** — Renders raw `att-<id>` strings inline as clickable chips that open the attempt pane. Models emit the bare id, no tag wrapping needed.
  - **`commit-link`** — Renders commit shas in backtick-wrapped inline code as clickable chips that open the commit-detail pane, with the subject, author and date on hover. Resolves the sha against the main checkout's object database and declines when it names no commit.
  - **`conv`** — Renders raw `conv-<id>` strings inline as clickable chips that open the referenced conversation in the right side pane alongside the host conversation. Models emit the bare id, no tag wrapping needed.
  - **`page-link`** — Renders raw `block-<id>` strings inline as clickable chips that open the page displaying that block in the page-detail pane. Models emit the bare id, no tag wrapping needed.
  - **`plugin-link`** — Renders plugin IDs in backtick-wrapped inline code as clickable chips that open the plugin-view pane. Models emit the plugin's dotted id (e.g. `tasks`, `active-data.conv`) and the chip validates and resolves it at render time.
  - **`task`** — Renders <task>prompt</task> tags as editable cards with Create + Launch actions. Models suggest tasks inline; users tweak and act without leaving the transcript.
  - **`task-link`** — Renders raw `task-<id>` strings inline as clickable chips that open the task detail pane. Models emit the bare id, no tag wrapping needed.

<!-- AUTOGENERATED:END -->
