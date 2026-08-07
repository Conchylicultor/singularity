import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  $setSelection,
  type ElementNode,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import type { ComponentType } from "react";
import {
  runsToLexical as runsToLexicalWith,
  serializeBlockRuns as serializeBlockRunsWith,
  tokenOf as tokenOfWith,
  type RichText,
  type RunsTokenExtension,
} from "../../core";
import type { Block } from "../../core";
import type { BlockEditorAPI } from "../types";

// The pure runs↔nodes walk lives in `core/runs-lexical.ts` (shared with the
// runs↔Y.XmlText bridge); this module binds it to the registered extension set
// and keeps the historical unparameterized signatures. `colorCssValue` moved
// with the walk — re-exported here so the web barrel's surface is unchanged.
export { colorCssValue } from "../../core";

/** Props every contributed block-text Lexical plugin receives. */
export interface BlockTextPluginProps {
  block: Block;
  editor: BlockEditorAPI;
}

/**
 * An optional custom inline node for the block text editor, plus the
 * (de)serialization rules that round-trip it through the block's `data.text`,
 * and/or an invisible Lexical `Plugin` contributing behavior.
 *
 * Two flavors share this interface:
 *  - **Node extensions** set `node` + `deserializePattern` + `createNodeFromMatch`
 *    + `serializeNode` (and usually a typeahead `Plugin`). They mirror the
 *    text-editor primitive's `NodeExtension` (see
 *    `plugins/primitives/plugins/text-editor/web/internal/node-extensions.ts`):
 *    inline nodes survive as text tokens (e.g. `[[<pageId>]]`) embedded in run
 *    text — `serializeNode` writes the token, `deserializePattern` +
 *    `createNodeFromMatch` parse it back. Marks/color/link are a parallel concern
 *    layered on the surrounding `TextNode`s; decorator nodes are always emitted
 *    as unmarked runs.
 *  - **Plugin-only extensions** set just `Plugin` and contribute pure behavior
 *    (e.g. a paste handler) with no inline node. They omit every node field.
 *
 * The (de)serialization trio (`deserializePattern` / `createNodeFromMatch` /
 * `serializeNode`) is the `RunsTokenExtension` slice consumed by the shared
 * runs↔nodes walk in `core/runs-lexical.ts`.
 */
export interface BlockTextExtension extends RunsTokenExtension {
  /** Stable id (used as a React key when rendering `Plugin`). */
  id: string;
  /** Lexical node class registered in every block editor's config. */
  node?: Klass<LexicalNode>;
  /** Optional invisible Lexical plugin rendered inside every block composer. */
  Plugin?: ComponentType<BlockTextPluginProps>;
}

const extensions: BlockTextExtension[] = [];

export function registerBlockTextExtension(ext: BlockTextExtension): () => void {
  extensions.push(ext);
  return () => {
    const idx = extensions.indexOf(ext);
    if (idx >= 0) extensions.splice(idx, 1);
  };
}

export function getBlockTextExtensions(): readonly BlockTextExtension[] {
  return extensions;
}

/**
 * The registered token patterns, as the `MarkdownContext.protectedSpans` the
 * markdown conversion requires. An inline decorator token (`[[block-…]]`,
 * `[[date:…]]`, `\(latex\)`) is a plain substring inside `TextRun.text`, so the
 * marks-aware inline scan must be told to leave those bytes alone — inline LaTeX
 * is full of `_` and `*`.
 *
 * Read at call time, never memoized: extensions register during plugin load, and
 * a snapshot taken too early would silently degrade to no protection.
 */
export function blockTextProtectedSpans(): RegExp[] {
  return extensions
    .map((e) => e.deserializePattern)
    .filter((p): p is RegExp => p !== undefined);
}

/** Node classes to feed into a block editor's `LexicalComposer` config. */
export function blockTextNodes(): Klass<LexicalNode>[] {
  return extensions
    .map((e) => e.node)
    .filter((node): node is Klass<LexicalNode> => node !== undefined);
}

/**
 * The registry-bound options for the runs ↔ `Y.XmlText` bridge
 * (`core/runs-yjs.ts`): every registered token extension, plus the decorator
 * node classes those extensions materialize.
 *
 * ONE construction site, deliberately. The doc-init SEED (`runsToXmlText`) and
 * the doc-sourced PROJECTION (`xmlTextToRuns`) are inverses of each other over
 * the same doc, so a block seeded with one option set and read back with another
 * round-trips a decorator token into plain characters — silent data loss on a
 * persisted value. Two literals that happen to match today are not that
 * guarantee; sharing the construction is.
 *
 * Read at CALL time, never memoized: extensions register during plugin load
 * (see {@link blockTextProtectedSpans} for the same rule).
 */
export function blockTextRunsOptions(): {
  extensions: readonly BlockTextExtension[];
  nodes: Klass<LexicalNode>[];
} {
  return { extensions: getBlockTextExtensions(), nodes: blockTextNodes() };
}

// ---------------------------------------------------------------------------
// runs ↔ Lexical (bound to the registered extension set)
// ---------------------------------------------------------------------------

/**
 * Render runs into the editor root using every registered extension. Must be
 * called inside an `editor.update()`. See `core/runs-lexical.ts` for the walk.
 */
export function runsToLexical(runs: RichText): void {
  runsToLexicalWith(runs, extensions);
}

/**
 * Serialize the editor's content to structured runs using every registered
 * extension. See `core/runs-lexical.ts` for the walk.
 */
export function serializeBlockRuns(editor: LexicalEditor): RichText {
  return serializeBlockRunsWith(editor, extensions);
}

/** Serialize a decorator (non-text, non-element) node to its token text. */
function tokenOf(node: LexicalNode): string {
  return tokenOfWith(node, extensions);
}

/** Read the editor's content into runs (headless-friendly wrapper). */
export function lexicalToRuns(editor: LexicalEditor): RichText {
  return serializeBlockRuns(editor);
}

// ---------------------------------------------------------------------------
// Linear caret offset ↔ Lexical caret position
// ---------------------------------------------------------------------------
//
// The single source mapping a block editor's Lexical caret position to/from the
// **linear plain-text character offset** used by the stored runs. The basis is
// identical to `splitRuns` / `textOf` / `serializeBlockRuns` so read→write
// round-trips and the merge `joinOffset = textOf(target).length` line up exactly:
//
//   - TextNode      → `getTextContentSize()` chars
//   - LineBreakNode → 1 char (`\n`)
//   - decorator     → length of its serialized token (`tokenOf(node).length`);
//                     decorator nodes return "" from `getTextContent()`, so the
//                     native text basis would drift — we count the token instead.
//   - LinkNode      → recurse into children (never a leaf itself)
//   - between paragraphs → +1 char join (the `\n` `serializeBlockRuns` pushes).
//
// This guarantees `Σ nodePlainLength(leaves) === runsLength(serializeBlockRuns(…))`.
// These four helpers live here (next to `tokenOf` and the runs↔Lexical converter)
// rather than in `caret-geometry.ts` so they never import it — no import cycle.

/**
 * The per-leaf plain-text length in the stored-runs basis (see section comment).
 * A decorator node counts its full serialized token, never its (empty) text.
 */
export function nodePlainLength(node: LexicalNode): number {
  if ($isLineBreakNode(node)) return 1;
  if ($isTextNode(node)) return node.getTextContentSize();
  // Decorator (e.g. inline page link): count its serialized token length.
  return tokenOf(node).length;
}

/** A leaf node (text / line break / decorator) — never an element. */
function isLeaf(node: LexicalNode): boolean {
  return !$isElementNode(node);
}

/**
 * DFS the leaves of `node` in document order, invoking `visit` for each. Returns
 * the value `visit` returns when it short-circuits (non-undefined), else
 * undefined after the whole subtree is walked. Elements (paragraphs, LinkNodes)
 * are recursed into; every non-element is a leaf.
 */
function dfsLeaves(
  node: LexicalNode,
  visit: (leaf: LexicalNode) => void | { stop: true },
): { stop: true } | void {
  if (isLeaf(node)) return visit(node);
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      const r = dfsLeaves(child, visit);
      if (r) return r;
    }
  }
}

/** Sum of `nodePlainLength` over every leaf descendant of `node`. */
function leavesLength(node: LexicalNode): number {
  let total = 0;
  dfsLeaves(node, (leaf) => {
    total += nodePlainLength(leaf);
  });
  return total;
}

/** The root's element children (the paragraphs) in document order. */
function paragraphs(): ElementNode[] {
  return $getRoot().getChildren().filter($isElementNode);
}

/**
 * The total plain-text length across all paragraphs in the stored-runs basis:
 * Σ leaf lengths + one join char between consecutive paragraphs. Used for the
 * `$placeCaretAtLinearOffset` clamp and the `atEnd` comparison.
 */
export function $paragraphsPlainLength(): number {
  const paras = paragraphs();
  let total = 0;
  paras.forEach((para, i) => {
    if (i > 0) total += 1; // paragraph join (\n)
    total += leavesLength(para);
  });
  return total;
}

// ---------------------------------------------------------------------------
// The Yjs BASIS length (the editor-side twin of `xmlTextContentLength`)
// ---------------------------------------------------------------------------
//
// `$paragraphsPlainLength` above counts in the STORED-RUNS basis. `Y.XmlText`
// counts in a different one, and the two are NOT interchangeable:
//
//                        | runs basis (`$paragraphsPlainLength`) | Yjs basis
//   ---------------------|---------------------------------------|------------
//   TextNode             | chars                                 | chars **+1**
//   LineBreakNode        | 1                                     | 1
//   decorator            | `tokenOf(node).length` (e.g. 11)      | **1**
//   LinkNode / paragraph | recurse                               | recurse
//   paragraph join       | **+1**                                | **0**
//
// So `runsLength(serializeBlockRuns(editor))` and `xmlTextContentLength(doc)`
// disagree on any block holding an inline page-link / date chip / inline math,
// on any multi-paragraph block, and in fact on any block with text at all. The
// existing hydration guard survives only because it compares against ZERO.

/**
 * Inside a Lexical read/update: how much content the editor RENDERS, counted in
 * the **Yjs basis** — the editor-side twin of `xmlTextContentLength`
 * (`core/runs-yjs.ts`), which counts the same quantity over the `Y.XmlText`.
 *
 * It exists so "what the editor shows" and "what the content doc holds" become
 * **comparable**: the invariant a hydration check wants to assert is
 *
 *   `$xmlBasisContentLength(editor) === xmlTextContentLength(yDocContent(doc))`
 *
 * for a bound editor that has ingested its replica. Stated against
 * `$paragraphsPlainLength` instead, that equality is arithmetically FALSE for
 * perfectly-hydrated blocks (see the table above) — which is exactly the trap
 * this helper removes.
 *
 * **It must stay a structural mirror of `xmlTextContentLength`'s walk**, which
 * means mirroring `@lexical/yjs`'s REPRESENTATION, not the reader's intuition
 * about "content". Every branch below is that function's corresponding
 * `toDelta()` case, over the Lexical tree instead of the CRDT:
 *
 *   - element node (paragraph, `LinkNode`) → 0 for itself + recurse
 *     (`CollabElementNode` is an embedded `XmlText`, which the Yjs walk recurses
 *     into and counts nothing for);
 *   - `TextNode` → `getTextContentSize()` **+ 1**. A `CollabTextNode` is TWO
 *     delta ops — an embedded `Y.Map` carrying the node's properties, then the
 *     string — and the Yjs walk counts the map as one embed. Dropping the `+1`
 *     makes `"hello"` 5 here and 6 there;
 *   - `LineBreakNode` → 1 (`CollabLineBreakNode` is a single embedded `Y.Map`);
 *   - decorator → 1, never its token length (`CollabDecoratorNode` is an
 *     embedded `XmlElement` — one unit, whatever it renders as);
 *   - **no** paragraph join: the Yjs shape has no such character.
 *
 * Consequence worth stating, so nobody reads this number as a character count:
 * it is an AGREEMENT WITNESS, not a human-meaningful length — a per-text-node
 * embed rides along in both halves. That is deliberate: the live consumer of
 * `xmlTextContentLength` compares against zero, so re-basing it to count only
 * content would be a behavior change to a shipped guard, and belongs with the
 * stage that first renders these numbers to a human, not here.
 *
 * Root children go through the SAME per-node rule rather than being filtered to
 * elements, because the Yjs walk applies its rule uniformly at every depth — a
 * non-element sitting directly under the root would count 1 there, and must here.
 *
 * The agreement is pinned by the property test over the shared fuzz corpus in
 * `block-text-extensions.test.ts`; a drift is a hydration check that reads a
 * healthy block as starved (or a starved one as healthy).
 */
export function $xmlBasisContentLength(): number {
  const count = (node: LexicalNode): number => {
    if ($isLineBreakNode(node)) return 1;
    // +1 for the CollabTextNode's embedded property `Y.Map` (see above).
    if ($isTextNode(node)) return node.getTextContentSize() + 1;
    if ($isElementNode(node)) {
      let inner = 0;
      for (const child of node.getChildren()) inner += count(child);
      return inner;
    }
    return 1; // decorator — one embedded element, not its token text
  };
  let total = 0;
  for (const child of $getRoot().getChildren()) total += count(child);
  return total;
}

/**
 * The linear offset of the paragraph boundary at root child index `index` — the
 * position immediately BEFORE the `index`-th paragraph, or the very end of the
 * content when `index` is at/past the last one. Each preceding paragraph
 * contributes its leaf length plus the join char that follows it; the LAST
 * paragraph is followed by no join, so a boundary past the end lands on the end
 * of the content rather than one char beyond it.
 */
function offsetOfParagraphBoundary(index: number): number {
  const paras = paragraphs();
  const before = Math.min(Math.max(index, 0), paras.length);
  let acc = 0;
  for (let i = 0; i < before; i++) acc += leavesLength(paras[i]!) + 1;
  return before === paras.length ? Math.max(acc - 1, 0) : acc;
}

/**
 * Inside a Lexical read/update: the selection anchor's linear offset in the
 * stored-runs basis, or null when there is no range selection. Handles a text
 * anchor (offset relative to a text node), an element anchor (offset is a child
 * index on a paragraph or LinkNode) by walking leaves in document order, and a
 * ROOT anchor (offset is a paragraph index).
 */
export function $linearCaretOffset(): number | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  const anchorKey = anchorNode.getKey();

  // A ROOT anchor is a DOCUMENT-level position ("before the Nth paragraph"), not
  // a paragraph-relative one, so the per-paragraph walk below can never find it —
  // it would fall through every branch and return null. Lexical mints exactly this
  // anchor whenever a selection first materializes while the root is still
  // CHILDLESS, which is the normal state of a freshly split/inserted block: its
  // editor takes DOM focus before the content doc has bootstrapped the empty
  // paragraph in (`focusHydratingAware`), so the browser's default selection
  // resolves to the root. Nothing re-anchors it afterwards, so an unresolved null
  // here left `atStart`/`atEnd` reading FALSE forever in that block, silently
  // demoting every structural keystroke to a passthrough — Backspace-at-start in a
  // brand-new empty block did nothing at all until some other edit moved the
  // anchor down into the paragraph.
  if ($isRootNode(anchorNode)) return offsetOfParagraphBoundary(anchor.offset);

  const paras = paragraphs();
  let acc = 0;
  let result: number | null = null;
  for (let i = 0; i < paras.length; i++) {
    if (i > 0) acc += 1; // paragraph join (\n)
    const para = paras[i]!;

    if ($isTextNode(anchorNode)) {
      // Text anchor: accumulate leaf lengths until we reach that exact node,
      // then add the anchor's in-node offset.
      const r = dfsLeaves(para, (leaf) => {
        if (leaf.getKey() === anchorKey) {
          result = acc + anchor.offset;
          return { stop: true };
        }
        acc += nodePlainLength(leaf);
      });
      if (r) return result;
    } else if ($isElementNode(anchorNode)) {
      // Element anchor (paragraph or LinkNode): `anchor.offset` is a child index.
      // The linear offset is `acc` + the leaf length of every leaf that precedes
      // the anchor element's first `anchor.offset` children, in document order.
      const within = offsetOfElementAnchor(para, anchorNode, anchor.offset);
      if (within !== null) return acc + within;
      // Anchor not in this paragraph — advance past its leaves.
      acc += leavesLength(para);
    } else {
      acc += leavesLength(para);
    }
  }
  return result;
}

/**
 * The linear offset, relative to `para`'s start, of an element anchor on
 * `anchorEl` at child index `childIndex` — or null when `anchorEl` is not in
 * `para`'s subtree. Walks `para`'s leaves in document order, summing lengths
 * until the walk reaches `anchorEl`, then adds the leaf length of `anchorEl`'s
 * first `childIndex` children.
 */
function offsetOfElementAnchor(
  para: ElementNode,
  anchorEl: ElementNode,
  childIndex: number,
): number | null {
  const anchorKey = anchorEl.getKey();
  const sumFirstChildren = (el: ElementNode): number => {
    const kids = el.getChildren();
    let inner = 0;
    for (let j = 0; j < Math.min(childIndex, kids.length); j++) {
      inner += leavesLength(kids[j]!);
    }
    return inner;
  };

  if (para.getKey() === anchorKey) return sumFirstChildren(para);

  let local = 0;
  let result: number | null = null;
  const walk = (node: LexicalNode) => {
    if (result !== null) return;
    if ($isElementNode(node) && node.getKey() === anchorKey) {
      result = local + sumFirstChildren(node);
      return;
    }
    if (isLeaf(node)) {
      local += nodePlainLength(node);
      return;
    }
    if ($isElementNode(node)) for (const c of node.getChildren()) walk(c);
  };
  for (const c of para.getChildren()) walk(c);
  return result;
}

/**
 * The leaf a linear `offset` resolves to, and where that leaf starts.
 *
 * `emptyParagraph` is the one outcome with no leaf: the offset lands in a
 * paragraph that has none, so the caret collapses to that paragraph's start.
 *
 * The `<=` in the leaf search is the load-bearing detail and the reason this is
 * shared rather than reimplemented: **a text/text boundary resolves to the END of
 * the EARLIER run.** That single choice is the editor's caret bias at a run seam,
 * and it must be answered ONCE — the caret's mark-boundary lookahead
 * (`caret-geometry.ts`) reads the boundary at a destination the executor is about
 * to land on, so a second resolver that biased the other way would have the
 * lookahead describing a position the landing never produces.
 */
export function $resolveLinearOffset(
  offset: number,
): { leaf: LexicalNode; leafStart: number } | { emptyParagraph: ElementNode } | null {
  const total = $paragraphsPlainLength();
  const target = Math.min(Math.max(offset, 0), total);

  const paras = paragraphs();
  if (paras.length === 0) return null;

  // Find the first leaf whose span contains `target` (inclusive end), spanning
  // paragraph joins. We track an absolute cursor across all paragraphs.
  let cursor = 0;
  let hit: { leaf: LexicalNode; leafStart: number } | null = null;
  outer: for (let i = 0; i < paras.length; i++) {
    if (i > 0) cursor += 1; // paragraph join
    const para = paras[i]!;
    const startBefore = cursor;
    const r = dfsLeaves(para, (leaf) => {
      const len = nodePlainLength(leaf);
      const leafStart = cursor;
      const leafEnd = cursor + len;
      cursor = leafEnd;
      if (target <= leafEnd) {
        hit = { leaf, leafStart };
        return { stop: true };
      }
    });
    if (r) break outer;
    // Empty paragraph with target landing here (no leaves consumed it).
    if (startBefore === cursor && target <= cursor) return { emptyParagraph: para };
  }

  if (hit) return hit;

  // Past the last leaf (or no leaves at all) — collapse to the last paragraph.
  const last = paras[paras.length - 1]!;
  const lastLeaf = lastLeafOf(last);
  if (!lastLeaf) return { emptyParagraph: last };
  return { leaf: lastLeaf, leafStart: total - nodePlainLength(lastLeaf) };
}

/**
 * Inside a Lexical update: place a collapsed caret at the linear `offset` in the
 * stored-runs basis (clamped to `[0, $paragraphsPlainLength()]`), at the leaf
 * {@link $resolveLinearOffset} picks. TextNode → text selection; an atomic leaf
 * (line break / decorator) → element selection in its parent at the before/after
 * child index. An empty paragraph collapses to its start.
 */
export function $placeCaretAtLinearOffset(offset: number): void {
  const resolved = $resolveLinearOffset(offset);
  if (resolved === null) {
    $getRoot().selectStart();
    return;
  }
  if ("emptyParagraph" in resolved) {
    resolved.emptyParagraph.selectStart();
    return;
  }
  const total = $paragraphsPlainLength();
  placeAtLeaf(resolved.leaf, Math.min(Math.max(offset, 0), total), resolved.leafStart);
}

/** The last leaf descendant of `node` (null when it has none). */
function lastLeafOf(node: LexicalNode): LexicalNode | null {
  let last: LexicalNode | null = null;
  dfsLeaves(node, (leaf) => {
    last = leaf;
  });
  return last;
}

/**
 * Collapse the caret onto a single resolved leaf at linear `target`, where the
 * leaf spans `[leafStart, leafStart + nodePlainLength(leaf)]`.
 */
function placeAtLeaf(leaf: LexicalNode, target: number, leafStart: number): void {
  if ($isTextNode(leaf)) {
    const off = Math.min(target - leafStart, leaf.getTextContentSize());
    const sel = $createRangeSelection();
    sel.anchor.set(leaf.getKey(), off, "text");
    sel.focus.set(leaf.getKey(), off, "text");
    $setSelection(sel);
    return;
  }
  // Atomic leaf (line break / decorator): an element selection in its PARENT at
  // the child index — before the node when `target <= leafStart`, else after.
  // A decorator hit strictly inside its span clamps to the nearer edge.
  const parent = leaf.getParent();
  if (!parent || !$isElementNode(parent)) {
    $getRoot().selectStart();
    return;
  }
  const index = leaf.getIndexWithinParent();
  const leafEnd = leafStart + nodePlainLength(leaf);
  let childIndex: number;
  if (target <= leafStart) {
    childIndex = index;
  } else if (target >= leafEnd) {
    childIndex = index + 1;
  } else {
    // Strictly inside a decorator span — clamp to the nearer edge.
    childIndex = target - leafStart <= leafEnd - target ? index : index + 1;
  }
  const sel = $createRangeSelection();
  sel.anchor.set(parent.getKey(), childIndex, "element");
  sel.focus.set(parent.getKey(), childIndex, "element");
  $setSelection(sel);
}
