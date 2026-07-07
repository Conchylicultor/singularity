import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
} from "lexical";
import { $createLinkNode, $isLinkNode } from "@lexical/link";
import {
  coalesce,
  MARK_ORDER,
  type ColorToken,
  type Mark,
  type RichText,
  type TextRun,
} from "./rich-text";

/**
 * The pure runs ↔ Lexical-nodes walk, factored out of the editor's web-side
 * extension registry so every consumer of the mapping shares ONE
 * implementation:
 *
 *  - the live block editor (`web/internal/block-text-extensions.ts` wraps these
 *    with the registered extension set),
 *  - the runs ↔ `Y.XmlText` bridge (`./runs-yjs.ts`, headless — including
 *    server-side seeding in later CRDT stages).
 *
 * Headless-safe: no DOM APIs — runs under Bun via `createEditor()` +
 * `editor.update()`.
 */

/**
 * The (de)serialization surface of an inline token extension — the narrow slice
 * of the editor's `BlockTextExtension` the node-walk needs. Inline decorator
 * nodes persist as text tokens (e.g. `[[<pageId>]]`) embedded in run text:
 * `serializeNode` writes the token, `deserializePattern` +
 * `createNodeFromMatch` parse it back. Marks/color/link are a parallel concern
 * layered on the surrounding `TextNode`s; decorator nodes are always emitted as
 * unmarked runs.
 */
export interface RunsTokenExtension {
  /** Non-global regex matching this extension's token within a single line. */
  deserializePattern?: RegExp;
  /** Build the inline node for a regex match (return null to skip). */
  createNodeFromMatch?: (match: RegExpExecArray) => LexicalNode | null;
  /** Serialize a custom node to its token (return null if not this node). */
  serializeNode?: (node: LexicalNode) => string | null;
}

// ---------------------------------------------------------------------------
// runs → Lexical
// ---------------------------------------------------------------------------

const CSS_VAR_PREFIX = "--rt-color-";

/**
 * The CSS value for a color token's text color — `var(--rt-color-<token>)` — or
 * `null` for `default`/absent (no color). The single source of the `--rt-color-*`
 * contract shared by the converter (writes `style`) and the color toolbar button
 * (calls `$patchStyleText`). Lockstep with the `rich-text-palette` token group
 * that defines these vars.
 */
export function colorCssValue(color: ColorToken | undefined): string | null {
  return color && color !== "default" ? `var(${CSS_VAR_PREFIX}${color})` : null;
}

/** Inline `style` string for a color token (empty for default/absent). */
function colorStyle(color: ColorToken | undefined): string {
  const value = colorCssValue(color);
  return value ? `color: ${value}` : "";
}

/** Apply a run's marks + color onto a fresh `TextNode`. */
function styleTextNode(node: TextNode, run: TextRun): void {
  for (const mark of run.marks ?? []) node.toggleFormat(mark);
  const style = colorStyle(run.color);
  if (style) node.setStyle(style);
}

/**
 * Build the inline leaf nodes for one line segment of a run's text (no `\n`),
 * materializing extension tokens as their decorator nodes and styling the
 * remaining text spans with the run's marks/color. Mirrors the old
 * `appendLineNodes` token loop (overlap guard + sort by start).
 */
function lineNodes(
  line: string,
  run: TextRun,
  extensions: readonly RunsTokenExtension[],
): LexicalNode[] {
  const out: LexicalNode[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    const node = $createTextNode(text);
    styleTextNode(node, run);
    out.push(node);
  };

  if (extensions.length === 0) {
    pushText(line);
    return out;
  }

  type TokenMatch = { start: number; end: number; node: LexicalNode };
  const matches: TokenMatch[] = [];
  for (const ext of extensions) {
    if (!ext.deserializePattern || !ext.createNodeFromMatch) continue;
    const re = new RegExp(ext.deserializePattern.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const node = ext.createNodeFromMatch(m);
      if (node) matches.push({ start: m.index, end: m.index + m[0].length, node });
    }
  }
  matches.sort((a, b) => a.start - b.start);
  let lastIdx = 0;
  for (const match of matches) {
    if (match.start < lastIdx) continue;
    pushText(line.slice(lastIdx, match.start));
    // Decorator nodes are always unmarked.
    out.push(match.node);
    lastIdx = match.end;
  }
  pushText(line.slice(lastIdx));
  return out;
}

/** Append a run's content (token-parsed, `\n`→LineBreak, styled) into `parent`. */
function appendRun(
  parent: ElementNode,
  run: TextRun,
  extensions: readonly RunsTokenExtension[],
): void {
  const lines = run.text.split("\n");
  const built: LexicalNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) built.push($createLineBreakNode());
    built.push(...lineNodes(line, run, extensions));
  });
  if (run.link) {
    // Wrap the run's produced nodes in a LinkNode (url = link). Line breaks are
    // rare inside a link; keeping them in the same wrapper is acceptable.
    const linkNode = $createLinkNode(run.link);
    for (const n of built) linkNode.append(n);
    parent.append(linkNode);
  } else {
    for (const n of built) parent.append(n);
  }
}

/**
 * Render runs into the editor root. Clears the root and builds a single
 * paragraph; soft `\n` breaks within run text become `LineBreakNode`s in that
 * paragraph. Must be called inside an `editor.update()`. With no `extensions`,
 * tokens stay embedded in run text as plain characters (lossless — the token IS
 * text; extensions only materialize it as a decorator node).
 */
export function runsToLexical(
  runs: RichText,
  extensions: readonly RunsTokenExtension[] = [],
): void {
  const root = $getRoot();
  root.clear();
  const para = $createParagraphNode();
  for (const run of runs) appendRun(para, run, extensions);
  root.append(para);
}

/**
 * Append runs to the END of the editor's content — into the last paragraph
 * (creating one for an empty root) — preserving marks/color/link and
 * materializing extension tokens, exactly like {@link runsToLexical}. Must be
 * called inside an `editor.update()`.
 *
 * This is the Lexical-level `mergeRuns`: appending B's runs after A's content
 * yields a state that serializes to `mergeRuns(A, B)` (the seam coalesces at
 * serialize time). Used by the CRDT merge path to concatenate the merging
 * block's live runs onto the target block's bound editor, and by the headless
 * offscreen-merge fallback via `editYDocState`.
 */
export function $appendRuns(
  runs: RichText,
  extensions: readonly RunsTokenExtension[] = [],
): void {
  const root = $getRoot();
  const elements = root.getChildren().filter($isElementNode);
  let para = elements.length > 0 ? elements[elements.length - 1]! : null;
  if (!para) {
    para = $createParagraphNode();
    root.append(para);
  }
  for (const run of runs) appendRun(para, run, extensions);
}

// ---------------------------------------------------------------------------
// Lexical → runs
// ---------------------------------------------------------------------------

/** Derive a run's canonical marks from a `TextNode`'s format flags. */
function marksOf(node: TextNode): Mark[] {
  const marks: Mark[] = [];
  for (const mark of MARK_ORDER) {
    if (node.hasFormat(mark)) marks.push(mark);
  }
  return marks;
}

/** Parse a `TextNode`'s inline `style` back to a `ColorToken` (undefined if none). */
function colorOf(node: TextNode): ColorToken | undefined {
  const style = node.getStyle();
  const match = /color:\s*var\(--rt-color-([a-z]+)\)/.exec(style);
  return match ? (match[1] as ColorToken) : undefined;
}

/** Build a styled run from a `TextNode`, carrying an enclosing link url if any. */
function runFromTextNode(node: TextNode, link: string | undefined): TextRun {
  const run: TextRun = { text: node.getTextContent() };
  const marks = marksOf(node);
  if (marks.length > 0) run.marks = marks;
  const color = colorOf(node);
  if (color && color !== "default") run.color = color;
  if (link) run.link = link;
  return run;
}

/** Serialize a decorator (non-text, non-element) node to its token text. */
export function tokenOf(
  node: LexicalNode,
  extensions: readonly RunsTokenExtension[],
): string {
  for (const ext of extensions) {
    if (!ext.serializeNode) continue;
    const result = ext.serializeNode(node);
    if (result !== null) return result;
  }
  return node.getTextContent();
}

/** Walk one node, appending its runs to `out` (recurses into LinkNodes). */
function walkNode(
  node: LexicalNode,
  link: string | undefined,
  out: RichText,
  extensions: readonly RunsTokenExtension[],
): void {
  if ($isLineBreakNode(node)) {
    out.push({ text: "\n", ...(link ? { link } : {}) });
    return;
  }
  if ($isTextNode(node)) {
    out.push(runFromTextNode(node, link));
    return;
  }
  if ($isLinkNode(node)) {
    const url = node.getURL();
    for (const child of node.getChildren()) walkNode(child, url, out, extensions);
    return;
  }
  // Decorator (e.g. inline page link) → unmarked token run.
  out.push({ text: tokenOf(node, extensions), ...(link ? { link } : {}) });
}

/**
 * Serialize the editor's content to structured runs. Walks each paragraph's
 * children; paragraphs are joined by `\n`. The plain-text offset basis (token
 * text counted as part of the offset) matches the caret offset and `splitRuns`.
 */
export function serializeBlockRuns(
  editor: LexicalEditor,
  extensions: readonly RunsTokenExtension[] = [],
): RichText {
  const runs: RichText = [];
  editor.getEditorState().read(() => {
    const root = $getRoot();
    const paras = root.getChildren().filter($isElementNode);
    paras.forEach((para, i) => {
      if (i > 0) runs.push({ text: "\n" });
      for (const child of para.getChildren()) walkNode(child, undefined, runs, extensions);
    });
  });
  return coalesce(runs);
}
