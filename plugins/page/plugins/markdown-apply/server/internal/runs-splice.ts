import {
  $createParagraphNode,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
  type TextNode,
} from "lexical";
import { $isLinkNode } from "@lexical/link";
import {
  $appendRuns,
  coalesce,
  colorCssValue,
  MARK_ORDER,
  runsToLexical,
  type ColorToken,
  type RichText,
  type TextRun,
} from "@plugins/page/plugins/editor/core";

/**
 * The content-doc SPLICE: bring a block's Lexical content to `newRuns` while
 * changing as few nodes as possible.
 *
 * ---------------------------------------------------------------------------
 * Why "as few nodes as possible" is the whole point
 * ---------------------------------------------------------------------------
 *
 * A block's text lives in a `Y.Doc`. Rebuilding it (`runsToLexical`, which
 * clears the root) makes every character a NEW CRDT item, so a concurrent
 * editor's overlapping edit duplicates instead of merging and the block's
 * `Y.UndoManager` history is severed. An agent changing one word must not cost
 * the document that.
 *
 * ---------------------------------------------------------------------------
 * The two-level trim, and who does each level
 * ---------------------------------------------------------------------------
 *
 *  - **Node level, here.** Both sides are flattened to the paragraph's *leaf
 *    units* (text / line-break / link) and the common prefix and suffix of
 *    IDENTICAL units are left untouched — same node objects, same keys, so the
 *    binding emits nothing for them.
 *  - **Character level, NOT here.** When the changed middle is one text unit on
 *    each side with identical marks/color, we `setTextContent` that ONE node.
 *    `@lexical/yjs` then diffs its old and new text with `simpleDiffWithCursor`
 *    and splices only the changed span — literally the same delta a human
 *    typing that edit would have produced. Hand-rolling a second character diff
 *    here would only give the binding a chance to disagree with itself.
 *
 * That fast path is the motivating case (an agent edits a word in a plain
 * paragraph). Everything else falls to the general path: build the middle with
 * the SHARED runs→nodes walk (`$appendRuns`, so a marked / linked / multi-line
 * middle is rendered exactly as a seed would render it) and splice it between
 * the preserved prefix and suffix nodes. Identity loss is then bounded to the
 * units that actually changed.
 *
 * ---------------------------------------------------------------------------
 * The one shape not handled incrementally
 * ---------------------------------------------------------------------------
 *
 * A block doc is a SINGLE paragraph by construction: `runsToLexical` seeds one,
 * `$appendRuns` appends into the last one, and the editor's Enter splits the
 * BLOCK rather than the paragraph. A doc with zero or several paragraphs is
 * therefore not a state this system produces — so it is rebuilt wholesale
 * rather than given a paragraph-boundary alignment nothing would ever exercise.
 * Correct, just not identity-preserving; stated rather than hidden.
 *
 * Extensions are deliberately `[]`: inline decorator tokens (`[[page:<pageId>]]`,
 * `\(latex\)`) are web-only Lexical node classes, so the server keeps them as
 * the plain characters they already are inside `TextRun.text`. See the note on
 * `readBlockDocRuns` for the case this does NOT cover.
 */

/** One leaf of the paragraph: the atom this module aligns by. */
interface OldUnit {
  node: LexicalNode;
  /** Everything but the text — two units may merge their text only if equal. */
  attrKey: string;
  text: string;
  isText: boolean;
}

interface NewUnit {
  /** The run that rebuilds this unit through the shared `$appendRuns` walk. */
  run: TextRun;
  attrKey: string;
  text: string;
  isText: boolean;
}

const SEP = String.fromCharCode(0);

/** The inline `style` string `styleTextNode` writes for a color token. */
function styleFor(color: ColorToken | undefined): string {
  const value = colorCssValue(color);
  return value ? `color: ${value}` : "";
}

/** A run's canonical marks fingerprint (already sorted at the storage layer). */
function marksKeyOfRun(run: TextRun): string {
  return MARK_ORDER.filter((m) => (run.marks ?? []).includes(m)).join(",");
}

/** A `TextNode`'s marks fingerprint, read through the same canonical order. */
function marksKeyOfNode(node: TextNode): string {
  return MARK_ORDER.filter((m) => node.hasFormat(m)).join(",");
}

/**
 * The attributes a `LinkNode`'s content carries, read off its first text child
 * — `appendRun` styles every node it builds for one run identically, so the
 * first child speaks for the whole link.
 */
function linkChildAttrs(node: ElementNode): string {
  const first = node.getChildren().find($isTextNode);
  return first === undefined
    ? `${SEP}`
    : `${marksKeyOfNode(first)}${SEP}${first.getStyle()}`;
}

/**
 * The old side's units: the paragraph's DIRECT children. A `LinkNode` is one
 * unit rather than a nested list, so a link whose text changed is rebuilt whole
 * — coarser than a text node, and the price of not teaching this module how to
 * reparent into an element.
 */
function oldUnitsOf(children: readonly LexicalNode[]): OldUnit[] {
  return children.map((node) => {
    if ($isLineBreakNode(node)) {
      return { node, attrKey: "br", text: "", isText: false };
    }
    if ($isTextNode(node)) {
      return {
        node,
        attrKey: `text${SEP}${marksKeyOfNode(node)}${SEP}${node.getStyle()}`,
        text: node.getTextContent(),
        isText: true,
      };
    }
    if ($isLinkNode(node)) {
      return {
        node,
        attrKey: `link${SEP}${node.getURL()}${SEP}${linkChildAttrs(node)}`,
        text: node.getTextContent(),
        isText: false,
      };
    }
    // A decorator node (an inline page-link / date / math token materialized by
    // a browser). Unreachable in practice — hydrating such a doc throws in
    // `@lexical/yjs` long before we get here, because its class is not
    // registered server-side. Keyed on the node's identity so it can never
    // match an incoming unit and get silently preserved.
    return {
      node,
      attrKey: `opaque${SEP}${node.getKey()}`,
      text: node.getTextContent(),
      isText: false,
    };
  });
}

/**
 * The new side's units, produced by SIMULATING `appendRun` (the shared walk)
 * with no extensions: a linked run becomes one `LinkNode`, an unlinked run
 * becomes one text unit per line with a line-break unit between them, and an
 * empty line segment emits nothing (`lineNodes` pushes no empty `TextNode`).
 *
 * The simulation is what makes the keys comparable with `oldUnitsOf`'s. It is
 * pinned by construction rather than by a test: the middle is REBUILT through
 * `$appendRuns` itself, so a drift here can only mis-align (a needless rebuild),
 * never mis-render.
 */
function newUnitsOf(runs: RichText): NewUnit[] {
  const out: NewUnit[] = [];
  for (const run of runs) {
    if (run.link) {
      out.push({
        run,
        attrKey: `link${SEP}${run.link}${SEP}${marksKeyOfRun(run)}${SEP}${styleFor(run.color)}`,
        text: run.text,
        isText: false,
      });
      continue;
    }
    const attrKey = `text${SEP}${marksKeyOfRun(run)}${SEP}${styleFor(run.color)}`;
    const lines = run.text.split("\n");
    lines.forEach((line, i) => {
      // A line break carries no marks of its own — `appendRun` emits a bare
      // `LineBreakNode` — so it rebuilds from a bare `\n` run.
      if (i > 0)
        out.push({
          run: { text: "\n" },
          attrKey: "br",
          text: "",
          isText: false,
        });
      if (line)
        out.push({
          run: { ...run, text: line },
          attrKey,
          text: line,
          isText: true,
        });
    });
  }
  return out;
}

function unitsEqual(a: OldUnit, b: NewUnit): boolean {
  return a.attrKey === b.attrKey && a.text === b.text;
}

/**
 * Inside an `editor.update()`: make the content equal `newRuns`, touching only
 * what changed. Returns nothing — the caller observes the effect as the Yjs
 * delta `editYDocState` hands back.
 */
export function $spliceRunsInto(newRuns: RichText): void {
  const root = $getRoot();
  const paragraphs = root.getChildren().filter($isElementNode);
  const paragraph = paragraphs.length === 1 ? paragraphs[0] : undefined;
  if (!paragraph) {
    // Not a shape this system produces (see the module header) — rebuild.
    runsToLexical(newRuns);
    return;
  }

  const oldUnits = oldUnitsOf(paragraph.getChildren());
  const newUnits = newUnitsOf(coalesce(newRuns));

  let prefix = 0;
  while (
    prefix < oldUnits.length &&
    prefix < newUnits.length &&
    unitsEqual(oldUnits[prefix]!, newUnits[prefix]!)
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldUnits.length - prefix &&
    suffix < newUnits.length - prefix &&
    unitsEqual(
      oldUnits[oldUnits.length - 1 - suffix]!,
      newUnits[newUnits.length - 1 - suffix]!,
    )
  ) {
    suffix += 1;
  }

  const oldMiddle = oldUnits.slice(prefix, oldUnits.length - suffix);
  const newMiddle = newUnits.slice(prefix, newUnits.length - suffix);
  if (oldMiddle.length === 0 && newMiddle.length === 0) return; // already equal

  // --- Fast path: one text node, one text unit, same attributes -------------
  // The motivating edit. `setTextContent` leaves the node (and therefore its
  // CRDT item) in place and lets the binding's own text diff splice the changed
  // span — see the module header.
  const oldOne = oldMiddle[0];
  const newOne = newMiddle[0];
  if (
    oldMiddle.length === 1 &&
    newMiddle.length === 1 &&
    oldOne !== undefined &&
    newOne !== undefined &&
    oldOne.isText &&
    newOne.isText &&
    oldOne.attrKey === newOne.attrKey
  ) {
    (oldOne.node as TextNode).setTextContent(newOne.text);
    return;
  }

  // --- General path: rebuild the middle through the shared walk -------------
  // `$appendRuns` targets the root's LAST element, so a scratch paragraph
  // appended here is what it fills. Building through it (rather than
  // hand-creating nodes) is what keeps a marked / linked / multi-line middle
  // byte-identical to what a fresh seed of the same runs would produce.
  const scratch = $createParagraphNode();
  root.append(scratch);
  $appendRuns(coalesce(newMiddle.map((u) => u.run)), []);
  const built = scratch.getChildren();

  // Insert BEFORE removing the old middle, so the paragraph is never
  // transiently empty (an empty element is a shape Lexical is entitled to
  // normalize away underneath us).
  const prefixLast = prefix > 0 ? oldUnits[prefix - 1]!.node : undefined;
  const suffixFirst =
    suffix > 0 ? oldUnits[oldUnits.length - suffix]!.node : undefined;
  if (prefixLast) {
    let anchor: LexicalNode = prefixLast;
    for (const node of built) {
      anchor.insertAfter(node);
      anchor = node;
    }
  } else if (suffixFirst) {
    // `insertBefore` places immediately before the anchor, so iterating the
    // built nodes in order yields their order.
    for (const node of built) suffixFirst.insertBefore(node);
  } else {
    for (const node of built) paragraph.append(node);
  }

  for (const unit of oldMiddle) unit.node.remove();
  scratch.remove();

  // A whole-content deletion can leave the paragraph — and with it the root —
  // childless. `runsToLexical([])` leaves one empty paragraph, so match it.
  if (root.getChildrenSize() === 0) root.append($createParagraphNode());
}
