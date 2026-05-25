# Page Plugin — Block-Based Editor Vision

## Context

Step toward the project vision: "a Notion-like surface where agents compose user-tailored apps from plugin building blocks." The `page` plugin delivers a block-based document editor where every block type is a plugin. Start minimal — nested text blocks only — then extend infinitely via slots.

## Plugin Structure

```
plugins/page/                        # umbrella
  editor/                            # the editor primitive
    core/                            # Block, Document types, schemas, resource descriptors
    web/                             # <BlockEditor>, provider, tree rendering, focus
    server/                          # tables, routes, mutations, live state
  blocks/                            # umbrella for block types
    text/                            # first block type
      core/                          # textBlock = Editor.defineBlock(...)
      web/                           # Lexical-based text block + keyboard handling
      package.json                   # lexical deps
  debug/                             # debug surface for testing
    web/                             # DebugApp.Sidebar entry + pane
```

## Data Model

A **document** contains a tree of **blocks**. Each block has a type and a JSONB data payload whose shape is defined by the block type plugin.

```
Document { id, title }
Block    { id, documentId, parentId, type, data: JSONB, rank, expanded }
```

- Nesting via adjacency list (`parentId` self-FK, same pattern as tasks)
- Ordering via fractional-index rank (same `rankText` as tasks)
- `type` discriminates which block plugin renders it
- `data` is opaque to the editor — each block type owns its schema

## Consumer API

### 1. Defining a block type

`Editor.defineBlock` is the single source of truth for a block type — its identifier string and data schema. The handle is used everywhere; raw type strings never appear at call sites.

```ts
// In the block type plugin's core/ barrel
import { Editor } from "@plugins/page/editor/core";

export const todoBlock = Editor.defineBlock({
  type: "todo",
  schema: z.object({ text: z.string(), checked: z.boolean() }),
});
```

### 2. Embedding the editor

```tsx
import { BlockEditor } from "@plugins/page/editor/web";

<BlockEditor documentId="doc-123" />
```

One component. The editor fetches blocks, renders the tree, handles focus, keyboard navigation, nesting, and persistence.

### 3. Registering a block renderer

```tsx
import { Editor } from "@plugins/page/editor/web";
import { todoBlock } from "@plugins/page/blocks/todo/core";

// In plugin contributions:
Editor.Block({ block: todoBlock, component: TodoBlock })
```

The component receives:

```tsx
interface BlockRendererProps<T = unknown> {
  block: Block;                    // { id, type, data, parentId, ... }
  isFocused: boolean;
  children: ReactNode;             // rendered children (see Nesting below)
  editor: BlockEditorAPI;          // operations handle
}

interface BlockEditorAPI {
  update(data: unknown): void;     // save block data (debounced)
  split(position: number): void;   // split at cursor → new sibling
  remove(): void;                  // delete this block
  indent(): void;                  // Tab — reparent under previous sibling
  outdent(): void;                 // Shift+Tab — reparent to parent's level
  focusUp(): void;                 // move focus to previous visible block
  focusDown(): void;               // move focus to next visible block
  onFocus(): void;                 // notify editor this block has focus
}
```

Block types use the handle to parse data with type safety:

```tsx
function TodoBlock({ block, editor }: BlockRendererProps) {
  const data = todoBlock.parse(block.data);  // { text: string, checked: boolean }
}
```

### 4. Creating blocks programmatically

```tsx
editor.create(todoBlock, { checked: false, text: "" });
//                        ^ typed from the schema — no raw strings
```
```

### 5. Nesting

Any block can have children. The editor manages the tree.

**Default behavior**: The block component renders its own content. The editor renders `children` below it with standard indentation. Most blocks (text, heading, image, code) just ignore the `children` prop.

**Opt-in control**: A block that wants to manage its children renders `{children}` itself. The editor detects this and skips default rendering.

```tsx
// Text — ignores children, editor handles nesting
function TextBlock({ block, editor }: BlockRendererProps) {
  return <InlineEditor text={block.data.text} />;
}

// Toggle — wraps children in collapsible
function ToggleBlock({ block, editor, children }: BlockRendererProps) {
  return (
    <>
      <button onClick={toggle}>{block.data.label}</button>
      {open && children}
    </>
  );
}
```

### 6. Keyboard contract

Block types that include text editing handle these keys and delegate to `editor`:

| Key         | Block responsibility                  | Editor handles                     |
| ----------- | ------------------------------------- | ---------------------------------- |
| Enter       | Detect cursor position                | Split block, create sibling, focus |
| Backspace   | Detect cursor at position 0           | Merge/delete, refocus              |
| Tab         | Prevent default                       | Indent (reparent)                  |
| Shift+Tab   | Prevent default                       | Outdent (reparent)                 |
| Arrow Up    | Detect cursor at first line start     | Focus previous block               |
| Arrow Down  | Detect cursor at last line end        | Focus next block                   |

Non-text blocks (image, divider) handle keyboard differently or delegate all keys to the editor.

### 7. Future extensibility slots

```
Editor.Block          — block type renderers          (v1)
Editor.SlashCommand   — slash menu entries             (future)
Editor.BlockAction    — per-block hover actions        (future)
Editor.Toolbar        — floating toolbar on selection  (future)
Editor.DragHandle     — custom drag handle behavior    (future)
```

## Reuse

| Need               | Reuse from                                           |
| ------------------- | ---------------------------------------------------- |
| Tree algorithms     | `buildTree`, `computeDrop` from `@plugins/tree/core` |
| Rank ordering       | `rankText`, `nextRankUnder` from `@plugins/rank`     |
| Live state          | `resourceDescriptor` + `useResource`                 |
| Inline text editing | Lexical (already in repo via `prompt-editor`)        |
| Autosave            | `useEditableField` from `@plugins/editable-field`    |
| Debug surface       | `DebugApp.Sidebar` + `Pane.Register` pattern         |

## Sub-tasks

Each sub-task gets its own detailed design and implementation. Dependencies flow top-down.

### Task 1: Schema & Server

Foundation. DB tables (`documents`, `blocks`), Zod schemas, resource descriptors, server routes (CRUD + split/merge/indent/outdent), `defineResource` for live state. No web code.

**Delivers:** tables, types, server API, live-state resources.

### Task 2: Editor Core

The `<BlockEditor>` component and its provider. Fetches blocks via `useResource`, builds the tree, renders `BlockRow` components dispatched via the `Editor.Block` slot, manages focus state and editor ref map. Defines the `Editor.Block` slot and `BlockRendererProps`/`BlockEditorAPI` contracts.

**Delivers:** `<BlockEditor documentId={...}>` that renders contributed block types. Stub "unknown block" fallback.

**Depends on:** Task 1 (types, resources).

### Task 3: Text Block

The first block type plugin. One Lexical `LexicalComposer` per block with `PlainTextPlugin`. `ValueSyncPlugin` for two-way text ↔ Lexical sync. `KeyboardPlugin` intercepting Enter/Backspace/Tab/Arrows and delegating to `BlockEditorAPI`. `useEditableField` for debounced persistence.

**Delivers:** a working text block that can be typed in, split, merged, indented, outdented, and navigated.

**Depends on:** Task 2 (editor component, slot, API contract).

### Task 4: Debug Pane

A `plugins/page/debug/` plugin that contributes a `DebugApp.Sidebar` entry opening a pane with the block editor. Auto-creates a test document if none exists. Minimal — just enough to exercise the full stack.

**Delivers:** clickable "Page Editor" entry in the Debug app sidebar that opens a working editor.

**Depends on:** Task 3 (need a block type to test with).
