# active-data

Meta plugin for inline interactive widgets rendered inside assistant text.
Sub-plugins under `plugins/active-data/plugins/<name>/` ship the component
that renders one widget kind.

Each `ActiveData.Tag` contribution declares a `display` mode:

- **`display: 'block'`** — agent wraps content in `<tag>…</tag>`. The host
  pre-extracts these before markdown parsing, so blank lines inside the tag
  body are handled correctly. Requires `tag: string`. The component receives
  `content` (trimmed inner text) and `attrs` (parsed tag attributes).
- **`display: 'code'`** — a token applied only inside backtick-wrapped inline
  code spans, never to regular text nodes. Two gates, and a claim protocol
  between them — see below.

**Inline chips are not an `ActiveData.Tag` mode.** A bare substring that renders
as a chip (`att-…`, `conv-…`, `<ui-context>`) is declared with
`InlineChip.Tag(inlineChip({…}))` from
`primitives/text-editor/plugins/inline-chip`, which owns the chip registry, the
one generic Lexical node, and `renderInlineChip` — read its `CLAUDE.md`. It is
backend-free so a composition without active-data can still draw a chip.
active-data's chip sub-plugins declare there, and active-data READS that
registry from its three host surfaces: the markdown enhancer and inline-text
walker (`useActiveDataLinkify`), and the page-editor bridge
(`internal/register-block-text-source.ts`, which registers the `"document"`
chips with `page/editor` — kept here so the page editor's host names no chip
family). The `active-data:document-chip-has-server-token` check also stays here:
it is written for these sub-plugins' server halves.

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
- **An inline chip has no claim protocol and must stay self-certifying.**
  Every inline pattern is unioned into ONE Lexical node, so a "declined" inline
  token would still be a committed node in the user's document with no host to
  catch it. A pattern whose validity needs I/O goes in `display:'code'`.

Hosts wire two helpers:

- `useActiveDataSegments(rawText)` — splits the raw string into `markdown`
  segments (passed to `<ReactMarkdown>`) and `block` segments (rendered
  directly as the contributed component, outside the markdown pipeline).
- `useActiveDataLinkify()` — returns a function that walks a rendered
  ReactNode tree and splices in the `"transcript"` inline chips. Call it from
  inside the host's react-markdown `transform` helper. Skips `code`/`pre`/`a`
  and custom components.

Renderers needing the host conversation read it via
`conversationPane.useData()` directly; the slot does not pipe it.

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

- Description: Meta plugin for inline interactive widgets agents render via XML-like tags in assistant text. Sub-plugins contribute block (tag) and code (claimed code-span) renderers, and declare inline chips through primitives/text-editor/inline-chip; hosts use useActiveDataSegments() + useActiveDataLinkify(). Persistent state for inline interactive widgets — table + resource keyed by (conversationId, messageId, tag, occurrenceIndex).
- Web:
  - Slots: `ActiveData.Tag` ← `active-data.commit-link`, `active-data.plugin-link`, `active-data.task`
  - Contributes:
    - `MarkdownEnhancerSlot`
    - `InlineTextWalkerSlot`
  - Uses:
    - `infra/endpoints.EndpointError`
    - `infra/endpoints.fetchEndpoint`
    - `page/editor.blockTextTokenExtension`
    - `page/editor.registerBlockTextExtensionSource`
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
    - `primitives/text-editor/inline-chip.InlineChipContribution`
    - `primitives/text-editor/inline-chip.inlineChipExtension`
    - `primitives/text-editor/inline-chip.inlineChips`
    - `primitives/text-editor/inline-chip.inlineChipWebNode`
    - `primitives/text-editor/inline-chip.renderInlineChip`
  - Exports (types):
    - `ActiveDataBindingHandle`
    - `ActiveDataBlockContribution`
    - `ActiveDataCodeContribution`
    - `ActiveDataContribution`
    - `ActiveDataIdentity`
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
    - `active-data/plugin-link`
    - `active-data/prototype`
    - `active-data/task`
    - `active-data/task-link`
    - `conversations/conversation-view/jsonl-viewer/assistant-text`
- Sub-plugins:
  - **`attempt`** — Renders raw `att-<id>` strings inline as clickable chips named after the attempt's conversation, opening that conversation (the attempt pane when it has none). Models emit the bare id, no tag wrapping needed. The attempt-id token at the page-editor's server boundary: locates `att-<id>` spans and names the shared inline-chip node, so a page block holding one of these chips stays agent-readable and agent-editable. Declares itself markdown-TRANSPARENT — a bare id has no character the inline scan could misread.
  - **`commit-link`** — Renders commit shas in backtick-wrapped inline code as clickable chips that open the commit-detail pane, with the subject, author and date on hover. Resolves the sha against the main checkout's object database and declines when it names no commit.
  - **`conv`** — Renders raw `conv-<id>` strings inline as clickable chips that open the referenced conversation in the right side pane alongside the host conversation. Models emit the bare id, no tag wrapping needed. The conversation-id token at the page-editor's server boundary: locates `conv-<id>` spans and names the shared inline-chip node, so a page block holding one of these chips stays agent-readable and agent-editable. Declares itself markdown-TRANSPARENT — a bare id has no character the inline scan could misread.
  - **`page-link`** — Renders raw `block-<id>` strings inline as clickable chips that open the page displaying that block in the page-detail pane. Models emit the bare id, no tag wrapping needed.
  - **`plugin-link`** — Renders plugin IDs in backtick-wrapped inline code as clickable chips that open the plugin-view pane. Models emit the plugin's dotted id (e.g. `tasks`, `active-data.conv`) and the chip validates and resolves it at render time.
  - **`prototype`** — Renders raw `proto-<id>` strings inline as clickable chips that open the mock in the prototype-detail pane. Models emit the bare id, no tag wrapping needed. The prototype-id token at the page-editor's server boundary: locates `proto-<id>` spans and names the shared inline-chip node, so a page block holding one of these chips stays agent-readable and agent-editable. Declares itself markdown-TRANSPARENT — a bare id has no character the inline scan could misread.
  - **`task`** — Renders <task>prompt</task> tags as editable cards with Create + Launch actions. Models suggest tasks inline; users tweak and act without leaving the transcript.
  - **`task-link`** — Renders raw `task-<id>` strings inline as clickable chips that open the task detail pane. Models emit the bare id, no tag wrapping needed. The task-id token at the page-editor's server boundary: locates `task-<id>` spans and names the shared inline-chip node, so a page block holding one of these chips stays agent-readable and agent-editable. Declares itself markdown-TRANSPARENT — a bare id has no character the inline scan could misread.

<!-- AUTOGENERATED:END -->
