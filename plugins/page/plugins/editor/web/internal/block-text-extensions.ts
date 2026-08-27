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
import type { ComponentType, ReactNode } from "react";
import {
  createSourcedRegistry,
  tokenExtension,
  type InlineTokenExtension,
  type InlineTokenNode,
  type InlineTokenNodeRef,
  type TokenFields,
} from "@plugins/primitives/plugins/text-editor/plugins/token-extension/core";
import {
  runsToLexical as runsToLexicalWith,
  serializeBlockRuns as serializeBlockRunsWith,
  tokenOf as tokenOfWith,
  type RichText,
} from "../../core";
import type { Block, MarkdownSpan } from "../../core";
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
 * One contribution to every block text editor.
 *
 * Two flavors share this type, and the pair is DISCRIMINATED so only the two
 * coherent shapes exist:
 *  - **Token extensions** carry a `node` (declared through the shared
 *    `defineInlineTokenNode`, so its token format, its field names and its
 *    Lexical type string are one declaration) AND the `pattern` that finds its
 *    token in a line — usually alongside a typeahead `Plugin`. Inline nodes
 *    persist as text tokens embedded in run text (`[[page:<id>]]`); the node
 *    descriptor writes the token and reads it back. Decorator nodes are always
 *    emitted as unmarked runs.
 *  - **Plugin-only extensions** set just `Plugin` and contribute pure behavior
 *    (e.g. a paste handler) with no inline node.
 *
 * Pattern and node are separate fields because they are genuinely many-to-one —
 * one node class can be fed by a UNION of patterns — but a `node` without a
 * `pattern` (a token nothing could ever parse back) is a tsc error, not a
 * convention. `renderToken` rides the same arm for the same reason: a family
 * that can appear in a document must be able to paint itself on a surface that
 * mounts no Lexical, and "somebody forgot" is exactly how `[[date:…]]` rendered
 * as literal brackets on every read-only surface for as long as it existed.
 */
export type BlockTextExtension = {
  /** Stable id (used as a React key when rendering `Plugin`). */
  id: string;
  /** Optional invisible Lexical plugin rendered inside every block composer. */
  Plugin?: ComponentType<BlockTextPluginProps>;
} & (
  | {
      node: InlineTokenNodeRef;
      pattern: RegExp;
      /**
       * Whether this family's bytes must be MASKED from the marks-aware inline
       * markdown scan — a SEPARATE question from `pattern`, which is only the
       * locator. See {@link MarkdownSpan}, which states the whole argument.
       *
       * Required rather than defaulted-off: the two ways of getting it wrong
       * point in opposite directions (an unprotected `\(a_1*b\)` is corrupted by
       * the scan; an over-protected bare id loses the marks a person put on it,
       * because a masked span becomes its own UNMARKED run), so there is no safe
       * default and the family that owns the bytes is the only one that knows.
       *
       * It used to BE `pattern` — every registered token got masking whether it
       * needed it or not — which is why `` `att-1787654245-y41m` `` pasted as
       * markdown came back with no `code` mark and chipped itself.
       */
      markdownSpan: MarkdownSpan;
      /**
       * Paint one of this family's tokens OUTSIDE Lexical — the read-only
       * renderer's half of the same declaration the decorator is.
       *
       * Field-type ERASED, like every other member a registry stores, and for
       * the same reason (see `InlineTokenNodeRef`): it takes the regex MATCH and
       * the family reads its own fields back out of it, so no family is ever
       * handed a record it did not write. {@link blockTextTokenExtension} is
       * where a contributor writes the typed `(fields: F) => ReactNode` this is
       * erased from.
       *
       * Returning `null` means "these characters are not mine after all" — the
       * two ways that happens being a match whose `fieldsOf` rejects it, and a
       * union node whose chip is absent from this composition. The renderer
       * paints the RAW TOKEN TEXT then, exactly as the Lexical decorator's own
       * unclaimed arm does. It is never a way to render nothing: that would
       * silently delete a token the document still holds.
       */
      renderToken: (match: RegExpExecArray) => ReactNode;
    }
  | {
      node?: undefined;
      pattern?: undefined;
      markdownSpan?: undefined;
      renderToken?: undefined;
    }
);

/** The `BlockTextExtension` arm that carries a token. */
export type BlockTextTokenExtension = Extract<
  BlockTextExtension,
  { node: InlineTokenNodeRef }
>;

/**
 * THE way to declare a token-bearing block-text extension.
 *
 * It exists to erase `renderToken` safely. A registry is a homogeneous list, so
 * what it stores cannot mention a family's own `F` — but a contributor writing
 * `({ pageId }) => <PageLinkChip pageId={pageId} />` should not have to widen
 * `pageId` to `string | null | undefined` and then narrow it back. So the typed
 * renderer is written here against the family's `F`, and the stored one takes
 * the MATCH and runs the family's own `fieldsOf` on it: the erasure is the same
 * one `InlineTokenNodeRef.createFromMatch` performs, and it is sound for the
 * same reason — the only field record a family receives is one it produced.
 */
export function blockTextTokenExtension<F extends TokenFields>(spec: {
  id: string;
  pattern: RegExp;
  markdownSpan: MarkdownSpan;
  node: InlineTokenNode<F>;
  renderToken: (fields: F) => ReactNode;
  Plugin?: ComponentType<BlockTextPluginProps>;
}): BlockTextTokenExtension {
  const { id, pattern, markdownSpan, node, renderToken, Plugin } = spec;
  return {
    id,
    pattern,
    markdownSpan,
    node,
    Plugin,
    renderToken: (match) => {
      const fields = node.fieldsOf(match);
      return fields === null ? null : renderToken(fields);
    },
  };
}

/**
 * The registry: items registered one by one, plus LAZY SOURCES folded in at
 * read time. Both halves come from `token-extension`'s `createSourcedRegistry`,
 * which is where the call-time rule is stated once for the two Lexical hosts
 * that need it (the prompt editor's `registerNodeExtension` is the other).
 */
const registry = createSourcedRegistry<BlockTextExtension>();

/**
 * The derived {@link InlineTokenExtension} for one registered extension, keyed
 * on the extension object's IDENTITY.
 *
 * The walks below run at caret frequency, so re-minting an extension per call
 * would compile a `RegExp` per token family per keystroke. A directly-registered
 * extension is a module constant and always hits; a SOURCE is asked to hand back
 * stable objects for entries that have not changed (see `createSourcedRegistry`'s
 * `registerSource` docblock), which is what makes its entries hit too.
 *
 * A `WeakMap`, so an unregistered extension's derivation is collectable with it.
 */
const derived = new WeakMap<BlockTextExtension, InlineTokenExtension>();

function tokenOfExtension(
  ext: BlockTextExtension,
): InlineTokenExtension | null {
  if (!ext.node || !ext.pattern) return null;
  const cached = derived.get(ext);
  if (cached) return cached;
  const token = tokenExtension({
    id: ext.id,
    pattern: ext.pattern,
    node: ext.node,
  });
  derived.set(ext, token);
  return token;
}

export function registerBlockTextExtension(
  ext: BlockTextExtension,
): () => void {
  return registry.register(ext);
}

/**
 * Register a LOOKUP called afresh on every read, rather than a finished list.
 *
 * For a contributor whose token set is itself a registry — active-data's inline
 * chips, which fill in as the plugin tiers load. A finished list handed over at
 * module eval would freeze whatever had loaded at that instant, and the rest of
 * the chips would round-trip as plain characters with nothing failing.
 *
 * Hand back STABLE objects for entries that have not changed: the token
 * extension each one derives is cached on object identity (see {@link derived}).
 */
export function registerBlockTextExtensionSource(
  source: () => readonly BlockTextExtension[],
): () => void {
  return registry.registerSource(source);
}

export function getBlockTextExtensions(): readonly BlockTextExtension[] {
  return registry.all();
}

/**
 * The registered extensions that carry a token, AS THEMSELVES — renderer
 * included.
 *
 * The read a surface with no Lexical takes. `matchTokens` is generic in its
 * extension type, so a match made over these hands back the very registration
 * that produced it and the renderer comes straight off it; joining back by `id`
 * would be a string key nothing checks.
 *
 * Read at CALL time, never memoized — same rule as {@link blockTextProtectedSpans}.
 */
export function blockTextRenderableExtensions(): readonly BlockTextTokenExtension[] {
  return registry
    .all()
    .filter((ext): ext is BlockTextTokenExtension => ext.node !== undefined);
}

/**
 * The registered extensions that actually carry a token — the input every
 * runs↔nodes walk takes. Read at CALL time, never memoized (see
 * {@link blockTextProtectedSpans} for the same rule), which is also what folds
 * a lazy source's current answer in.
 */
export function blockTextTokenExtensions(): readonly InlineTokenExtension[] {
  const out: InlineTokenExtension[] = [];
  for (const ext of registry.all()) {
    const token = tokenOfExtension(ext);
    if (token) out.push(token);
  }
  return out;
}

/**
 * The patterns of the families that ASKED to be masked, as the
 * `MarkdownContext.protectedSpans` the markdown conversion requires. An inline
 * decorator token (`[[page:…]]`, `[[date:…]]`, `\(latex\)`) is a plain substring
 * inside `TextRun.text` whose bytes markdown would read as syntax, so the
 * marks-aware inline scan must be told to leave them alone — inline LaTeX is
 * full of `_` and `*`.
 *
 * Only `markdownSpan: "protect"` families are here, which is why this reads the
 * REGISTRY rather than mapping `blockTextTokenExtensions()`: an
 * `InlineTokenExtension` carries the locator, not the masking statement, and a
 * bare-id token needs the first without the second (see {@link MarkdownSpan}).
 *
 * Read at call time, never memoized: extensions register during plugin load, and
 * a snapshot taken too early would silently degrade to no protection.
 */
export function blockTextProtectedSpans(): RegExp[] {
  const out: RegExp[] = [];
  for (const ext of registry.all()) {
    if (ext.pattern && ext.markdownSpan === "protect") out.push(ext.pattern);
  }
  return out;
}

/** Node classes to feed into a block editor's `LexicalComposer` config. */
export function blockTextNodes(): Klass<LexicalNode>[] {
  return blockTextTokenExtensions().map((e) => e.node.Node);
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
  extensions: readonly InlineTokenExtension[];
  nodes: Klass<LexicalNode>[];
} {
  return { extensions: blockTextTokenExtensions(), nodes: blockTextNodes() };
}

// ---------------------------------------------------------------------------
// runs ↔ Lexical (bound to the registered extension set)
// ---------------------------------------------------------------------------

/**
 * Render runs into the editor root using every registered extension. Must be
 * called inside an `editor.update()`. See `core/runs-lexical.ts` for the walk.
 */
export function runsToLexical(runs: RichText): void {
  runsToLexicalWith(runs, blockTextTokenExtensions());
}

/**
 * Serialize the editor's content to structured runs using every registered
 * extension. See `core/runs-lexical.ts` for the walk.
 */
export function serializeBlockRuns(editor: LexicalEditor): RichText {
  return serializeBlockRunsWith(editor, blockTextTokenExtensions());
}

/** Serialize a decorator (non-text, non-element) node to its token text. */
function tokenOf(node: LexicalNode): string {
  return tokenOfWith(node, blockTextTokenExtensions());
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
):
  | { leaf: LexicalNode; leafStart: number }
  | { emptyParagraph: ElementNode }
  | null {
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
    if (startBefore === cursor && target <= cursor)
      return { emptyParagraph: para };
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
  placeAtLeaf(
    resolved.leaf,
    Math.min(Math.max(offset, 0), total),
    resolved.leafStart,
  );
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
function placeAtLeaf(
  leaf: LexicalNode,
  target: number,
  leafStart: number,
): void {
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
