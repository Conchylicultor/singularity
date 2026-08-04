// The per-mutation "is it recorded" invariant.
//
// Every mutation reachable from `useBlockEditor()` must put exactly ONE entry on
// the unified undo stack — except the two deliberate exclusions (`setExpanded`,
// `projectText`). There is no third case: no structural mutation is left
// unrecorded, so a new one that records nothing has no precedent to hide behind.
// This file is the guardrail: adding a mutation without recording it, or letting
// an existing one silently stop mutating, fails here. Both halves are real
// regressions this suite was written against — `paste` reached the store without
// ever passing `dispatchOp`, and `update` was swallowed whole by a data-blind
// apply-guard while every "canUndo flipped" style assertion stayed green.
//
// ## The invariant is a QUADRUPLE, not a pair
//
// "canUndo flipped and undo restored the rows" passes VACUOUSLY when the forward
// mutation did nothing at all — which is exactly how the `update` bug hid. So
// `expectRecorded` also asserts the forward mutation genuinely changed the row
// set, and that redo reproduces it.
//
// ## Fidelity caveats
//
// - The harness mounts the PROVIDER only, with a `RowsProbe` standing in for
//   `BlockEditorInner`. That stand-in is load-bearing, not scaffolding: `rowsRef`
//   — which every mutation snapshots as its `before` — is populated by a CONSUMER
//   effect (`block-editor.tsx`'s `setRows`/`setFlatOrder`). Without a stand-in
//   mirroring the same derivation, every mutation here reads an EMPTY `rowsRef`,
//   no-ops, and the whole suite passes vacuously. Same reason
//   `block-selection.test.tsx` keeps a `FakeBlockEditor`. Rendering the real
//   `<BlockEditor>` instead would need every block type registered plus Lexical
//   and a Yjs binding per row in a layout-less DOM.
// - An EMPTY plugin list is the right fidelity: block handles only supply
//   `anchorTypes` (the childless-anchor prune and the split/merge refusals) and
//   `wrapOnConvert`, none of which any case here exercises.
// - `merge`/`mergeNext` are deliberately EXCLUDED. With no mounted focus handle,
//   `mergeBlock` takes the offscreen branch into `appendRunsToBlockDoc`, which
//   hits two doc endpoints — a different subject, needing endpoint mocks. Merge
//   and split-with-a-doc-edit belong to `e2e/crdt-undo-verify.ts`.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect, useMemo } from "react";
import { PluginProvider } from "@plugins/framework/plugins/web-sdk/core";
import { UndoRedoProvider } from "@plugins/primitives/plugins/undo-redo/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  planForestInsert,
  runsToXmlText,
  withMintedIds,
  type Block,
  type RichText,
  type SerializedBlock,
} from "../../core";
import {
  projectableRunsOf,
  type DocSourcedRuns,
} from "../internal/doc-sourced-runs";
import { fromNodes } from "../internal/optimistic-block-ops";
import { BlockEditorProvider, useBlockEditor } from "../block-editor-context";

const PAGE_ID = "page-1";
const TEXT = "page/text";

// Readable, reproducible ids: `withMintedIds` and every `newId` site mint
// through `crypto.randomUUID`, so a counter makes a failure's row set legible.
let uuidCounter = 0;
Object.defineProperty(globalThis.crypto, "randomUUID", {
  value: () => `id-${++uuidCounter}`,
  configurable: true,
  writable: true,
});

beforeEach(() => {
  uuidCounter = 0;
});
afterEach(cleanup);

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function node(text: string, children: SerializedBlock[] = []): SerializedBlock {
  return { type: TEXT, data: { text: [{ text }] }, expanded: true, children };
}

/**
 * `A ⊃ A1`, then `B`, `C` at top level — seeded through `MemoryBlockEditor`'s own
 * recipe, so the rows are shape-identical to production's. DEPTH is deliberate: a
 * flat fixture lets a same-parent rank sort masquerade as document order, which
 * is precisely the confusion `planBulkMove`'s `inDocumentOrder` exists to prevent.
 */
function seed(): Block[] {
  const forest = [node("A", [node("A1")]), node("B"), node("C")];
  const { nodes } = planForestInsert({
    pageId: PAGE_ID,
    parentId: PAGE_ID,
    rootRanks: Rank.nBetween(null, null, forest.length),
    forest: withMintedIds(forest),
  });
  return fromNodes(nodes, []);
}

/**
 * `runs` as the projection would actually produce them: round-tripped THROUGH a
 * content `Y.Doc`, since `projectText` only accepts doc-sourced runs (the
 * `DocSourcedRuns` brand — see `internal/doc-sourced-runs.ts`). A cast here
 * would defeat the very invariant the brand exists to state.
 */
function docRuns(runs: RichText): DocSourcedRuns {
  const doc = runsToXmlText(runs).doc;
  if (!doc) throw new Error("docRuns: seed XmlText is not attached to a doc");
  return projectableRunsOf(doc);
}

/** The comparable projection of a row set — order-free (rows are keyed by id). */
function snapshot(blocks: Block[]) {
  return [...blocks]
    .map((b) => ({
      id: b.id,
      parentId: b.parentId,
      type: b.type,
      rank: String(b.rank),
      expanded: b.expanded,
      data: b.data,
    }))
    .sort((x, y) => x.id.localeCompare(y.id));
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type Ctx = ReturnType<typeof useBlockEditor>;

/**
 * Stands in for `BlockEditorInner` — see the fidelity note in the file header.
 * The derivation is byte-for-byte what the real consumer feeds the provider.
 * `flatOrder` gets the same rank-sorted array: nothing this suite exercises reads
 * it (only `navigate` does), so an honest same-source feed beats re-implementing
 * `flattenTree` here.
 */
function RowsProbe({ onCtx }: { onCtx: (ctx: Ctx) => void }) {
  const ctx = useBlockEditor();
  // Published through a CALLBACK, not by writing a mutable prop: a prop object is
  // not this component's to modify (`react-hooks/immutability`), and the compiler
  // is right — the write belongs to `mount`'s closure, which owns the sink.
  //
  // No dep array on purpose: publish the context after EVERY commit, so a render
  // caused by nothing but `canUndo` flipping still updates the sink.
  useEffect(() => {
    onCtx(ctx);
  });

  const { blocks, setRows, setFlatOrder } = ctx;
  const rows = useMemo(
    () => [...blocks].sort((a, b) => Rank.compare(a.rank, b.rank)),
    [blocks],
  );
  useEffect(() => {
    setFlatOrder(rows);
    setRows(rows);
  }, [rows, setRows, setFlatOrder]);

  return null;
}

interface Harness {
  /** Always the LATEST committed context value. */
  ctx: () => Ctx;
  /** The seeded block id whose text is `text`. */
  id: (text: string) => string;
}

function mount(): Harness {
  const sink: { ctx: Ctx | null } = { ctx: null };
  const initialBlocks = seed();
  render(
    <PluginProvider plugins={[]}>
      <UndoRedoProvider>
        <BlockEditorProvider pageId={PAGE_ID} persist={false} initialBlocks={initialBlocks}>
          <RowsProbe
            onCtx={(next) => {
              sink.ctx = next;
            }}
          />
        </BlockEditorProvider>
      </UndoRedoProvider>
    </PluginProvider>,
  );
  const ctx = () => {
    if (!sink.ctx) throw new Error("provider never rendered its child");
    return sink.ctx;
  };
  const byText = new Map(
    initialBlocks.map((b) => {
      const runs = (b.data as { text: { text: string }[] }).text;
      return [runs[0]!.text, b.id] as const;
    }),
  );
  return {
    ctx,
    id: (text) => {
      const id = byText.get(text);
      if (!id) throw new Error(`no seeded block with text "${text}"`);
      return id;
    },
  };
}

/**
 * The whole invariant, in one place, so a new mutation is a one-line addition.
 * Everything is driven through `await act(async …)`: `undo`/`redo` run their
 * thunks through `void runGuarded(...)` and `split` defers its record a microtask.
 */
async function expectRecorded(run: (h: Harness) => void): Promise<void> {
  const h = mount();
  const before = snapshot(h.ctx().blocks);
  expect(h.ctx().canUndo).toBe(false);

  await act(async () => run(h));
  const after = snapshot(h.ctx().blocks);

  // (1) The forward mutation actually changed the document. Without this the
  //     rest of the quadruple is satisfiable by a mutation that does nothing.
  expect(after).not.toEqual(before);
  // (2) …and put an entry on the stack.
  expect(h.ctx().canUndo).toBe(true);

  // (3) Undo restores the prior row set EXACTLY.
  await act(async () => h.ctx().undo());
  expect(snapshot(h.ctx().blocks)).toEqual(before);

  // (4) Redo reproduces the post-mutation row set.
  await act(async () => h.ctx().redo());
  expect(snapshot(h.ctx().blocks)).toEqual(after);
}

// ---------------------------------------------------------------------------
// Recorded mutations
// ---------------------------------------------------------------------------

const RECORDED: [name: string, run: (h: Harness) => void][] = [
  [
    "paste",
    (h) => h.ctx().paste({ blocks: [node("P")], afterId: h.id("B") }),
  ],
  [
    // TWO roots on purpose: one gesture is ONE `duplicate` op however many roots
    // it clones, so a per-root dispatch (N entries, N undos) fails the quadruple
    // — undo would restore only the last clone's placement.
    "bulkDuplicate",
    (h) => h.ctx().bulkDuplicate([h.id("A"), h.id("C")]),
  ],
  [
    "bulkMove",
    (h) =>
      h.ctx().bulkMove({ ids: [h.id("C")], parentId: h.id("A"), afterId: h.id("A1") }),
  ],
  ["bulkDelete", (h) => h.ctx().bulkDelete([h.id("B")])],
  ["move", (h) => h.ctx().move(h.id("C"), "before", h.id("B"))],
  ["indentBlocks", (h) => h.ctx().indentBlocks([h.id("C")])],
  ["outdentBlocks", (h) => h.ctx().outdentBlocks([h.id("A1")])],
  ["insert", (h) => h.ctx().insert(TEXT, { text: [] })],
  ["insertFirst", (h) => h.ctx().insertFirst(TEXT, { text: [] })],
  ["unwrapBlock", (h) => h.ctx().unwrapBlock(h.id("A"))],
  // Both payloads are text-FREE, and not merely by choice: `RowData` makes a
  // row-level `text` write a compile error, because `page_blocks.data.text` is a
  // projection of the block's content `Y.Doc` with exactly one writer. So the
  // mutation each case has to make is the row fact it really owns — the TYPE for
  // `convertTo`, a non-text `data` field for `update` — which is also what makes
  // the quadruple's "the forward mutation genuinely changed something" arm honest
  // here rather than incidental.
  [
    "convertTo",
    (h) => h.ctx().makeBlockAPI(h.id("B")).convertTo("page/heading-1", {}),
  ],
  [
    "update",
    (h) => h.ctx().makeBlockAPI(h.id("B")).update({ checked: true }),
  ],
  [
    // Enter at offset 0 of a non-empty block: the identity-preserving arm, which
    // records a PLAIN structural entry (no content-doc edit to fold in).
    "split at offset 0",
    (h) => h.ctx().makeBlockAPI(h.id("B")).split(0, { runs: [{ text: "B" }] }),
  ],
];

describe("every editor mutation lands exactly one undo entry", () => {
  for (const [name, run] of RECORDED) {
    it(name, async () => {
      await expectRecorded(run);
    });
  }
});

// ---------------------------------------------------------------------------
// The deliberate non-recordings
// ---------------------------------------------------------------------------

describe("mutations that deliberately stay off the stack", () => {
  it("setExpanded changes the rows but records nothing (pure view state)", async () => {
    const h = mount();
    const before = snapshot(h.ctx().blocks);
    await act(async () => h.ctx().makeBlockAPI(h.id("A")).setExpanded(false));
    // Still optimistic — it just isn't a document edit.
    expect(snapshot(h.ctx().blocks)).not.toEqual(before);
    expect(h.ctx().canUndo).toBe(false);
  });

  it("projectText changes the rows but records nothing (Yjs owns text history)", async () => {
    const h = mount();
    const before = snapshot(h.ctx().blocks);
    await act(async () => h.ctx().projectText(h.id("B"), docRuns([{ text: "typed" }])));
    expect(snapshot(h.ctx().blocks)).not.toEqual(before);
    expect(h.ctx().canUndo).toBe(false);
  });

  it("a fully-refused indent records nothing and changes nothing", async () => {
    const h = mount();
    const before = snapshot(h.ctx().blocks);
    // `A` is the first top-level block: it has no previous sibling to nest under,
    // so `foldIndent` refuses the whole run and `dispatchOp` drops the empty diff
    // before it can reach the stack or the network.
    await act(async () => h.ctx().indentBlocks([h.id("A")]));
    expect(snapshot(h.ctx().blocks)).toEqual(before);
    expect(h.ctx().canUndo).toBe(false);
  });
});
