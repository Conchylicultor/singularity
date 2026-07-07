import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
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

/** Node classes to feed into a block editor's `LexicalComposer` config. */
export function blockTextNodes(): Klass<LexicalNode>[] {
  return extensions
    .map((e) => e.node)
    .filter((node): node is Klass<LexicalNode> => node !== undefined);
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

/**
 * Inside a Lexical read/update: the selection anchor's linear offset in the
 * stored-runs basis, or null when there is no range selection. Handles both a
 * text anchor (offset relative to a text node) and an element anchor (offset is a
 * child index on a paragraph or LinkNode) by walking leaves in document order.
 */
export function $linearCaretOffset(): number | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  const anchorKey = anchorNode.getKey();

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
 * Inside a Lexical update: place a collapsed caret at the linear `offset` in the
 * stored-runs basis (clamped to `[0, $paragraphsPlainLength()]`). Walks leaves
 * tracking `[leafStart, leafEnd]`; the target is the FIRST leaf where
 * `offset <= leafEnd` (`<=` so a text/text boundary resolves to the END of the
 * earlier run — correct for the merge seam). TextNode → text selection; an
 * atomic leaf (line break / decorator) → element selection in its parent at the
 * before/after child index. An empty paragraph collapses to its start.
 */
export function $placeCaretAtLinearOffset(offset: number): void {
  const total = $paragraphsPlainLength();
  const target = Math.min(Math.max(offset, 0), total);

  const paras = paragraphs();
  if (paras.length === 0) {
    $getRoot().selectStart();
    return;
  }

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
    if (startBefore === cursor && target <= cursor) {
      para.selectStart();
      return;
    }
  }

  if (!hit) {
    // Past the last leaf (or no leaves at all) — collapse to the last paragraph.
    const last = paras[paras.length - 1]!;
    const lastLeaf = lastLeafOf(last);
    if (!lastLeaf) {
      last.selectStart();
      return;
    }
    placeAtLeaf(lastLeaf, target, total - nodePlainLength(lastLeaf));
    return;
  }

  const { leaf, leafStart } = hit;
  placeAtLeaf(leaf, target, leafStart);
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
