import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $createParagraphNode,
  $createRangeSelection,
  $setSelection,
  SKIP_DOM_SELECTION_TAG,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type PointType,
} from "lexical";
import { hasToken } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/core";
import {
  $insertTokenizedText,
  $tokenizedLineNodes,
} from "@plugins/primitives/plugins/text-editor/plugins/token-extension/plugins/node/core";
import { getNodeExtensions, type NodeExtension } from "./node-extensions";

export function serializeEditorToMarkdown(
  editor: LexicalEditor,
  extensions: readonly NodeExtension[] = getNodeExtensions(),
): string {
  const lines: string[] = [];
  editor.getEditorState().read(() => {
    const root = $getRoot();
    for (const para of root.getChildren()) {
      if (!$isElementNode(para)) continue;
      let buf = "";
      for (const child of para.getChildren()) {
        if ($isLineBreakNode(child)) {
          buf += "\n";
        } else if ($isTextNode(child)) {
          buf += child.getTextContent();
        } else {
          let handled = false;
          for (const ext of extensions) {
            const result = ext.serializeNode(child);
            if (result !== null) {
              buf += result;
              handled = true;
              break;
            }
          }
          if (!handled) buf += child.getTextContent();
        }
      }
      lines.push(buf);
    }
  });
  return lines.join("\n");
}

// Deserialize one raw source line into Lexical nodes: every extension pattern
// (`<ui-context …>`, image markdown, …) becomes its node, the rest stays text.
// The single deserialization path — shared by the whole-value apply below and
// the caret insert — so a snippet dropped at the cursor yields the same nodes
// as the same snippet arriving through the value round-trip.
//
// The scan itself is the shared one (`token-extension`), so this editor and the
// page editor agree byte-for-byte about where a token starts and which of two
// overlapping candidates wins.
function $lineToNodes(
  line: string,
  extensions: readonly NodeExtension[],
): LexicalNode[] {
  return $tokenizedLineNodes(line, extensions);
}

// Does this raw snippet carry at least one node-extension token? The gate the
// paste path uses to decide between "deserialize into nodes" and "let the
// editor insert it as plain text" — same registry, same patterns as
// `$lineToNodes`, so the two can never disagree about what is a token.
export function hasNodeExtensionToken(
  text: string,
  extensions: readonly NodeExtension[] = getNodeExtensions(),
): boolean {
  return hasToken(text, extensions);
}

export function applyMarkdownToEditor(
  editor: LexicalEditor,
  markdown: string,
  extensions: readonly NodeExtension[] = getNodeExtensions(),
): void {
  // The rebuild below replaces every node in the document, which destroys the
  // selection — Lexical then parks the caret at the START of the new document.
  // That caret is a lie: it is not where the user was, and everything that acts
  // "at the caret" afterwards (typing, a template chip, a picked ui-context)
  // acts at the top of the draft and drags the viewport there with it. So the
  // caret is carried across the rebuild as raw-source offsets — the same
  // coordinate system `value` itself is in, and therefore the only one that
  // survives a re-serialization.
  const focused =
    editor.getRootElement() !== null &&
    editor.getRootElement() === document.activeElement;
  editor.update(
    () => {
      const carried = $captureCaret(extensions);
      const root = $getRoot();
      root.clear();
      const lines = markdown.split("\n");
      for (const line of lines) {
        const para = $createParagraphNode();
        for (const node of $lineToNodes(line, extensions)) para.append(node);
        root.append(para);
      }
      if (root.getChildrenSize() === 0) {
        root.append($createParagraphNode());
      }
      if (carried) {
        const len = markdown.length;
        $selectMarkdownRange(
          Math.min(carried.start, len),
          Math.min(carried.end, len),
          extensions,
        );
      } else {
        // Nothing to carry — this is a restore into an editor the user has not
        // put a caret in. The end of the restored text is where a draft is
        // continued, and it is what makes an insert land where the user is
        // reading rather than at the top.
        $getRoot().selectEnd();
      }
    },
    // An unfocused editor must not pull the browser's selection out of whatever
    // the user IS focused on: the editor-state caret above still points at the
    // end (so an insert appends there), but the DOM is left alone.
    focused ? undefined : { tag: SKIP_DOM_SELECTION_TAG },
  );
}

/**
 * The caret to carry across a whole-document rebuild, as raw-source offsets.
 *
 * `null` means "there is no caret worth carrying" — an empty document (the
 * caret Lexical parks in the placeholder paragraph is not a position the user
 * chose) or a point this module's flat paragraph/leaf shape cannot address.
 * Both are legitimate: the caller's answer for both is the same, and it is the
 * documented default (end of document), not a silent failure.
 */
function $captureCaret(
  extensions: readonly NodeExtension[],
): { start: number; end: number } | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  if ($getRoot().getTextContentSize() === 0) return null;
  const start = $rawOffsetOfPoint(selection.anchor, extensions);
  const end = $rawOffsetOfPoint(selection.focus, extensions);
  if (start === null || end === null) return null;
  return { start, end };
}

/** Raw-source character offset of a Lexical point — the inverse of `locatePoint`. */
function $rawOffsetOfPoint(
  point: PointType,
  extensions: readonly NodeExtension[],
): number | null {
  const root = $getRoot();
  const paragraphs = root.getChildren();

  // Where each top-level line starts in the raw string (+1 for its "\n").
  const lineStart = new Map<string, number>();
  let total = 0;
  for (const para of paragraphs) {
    lineStart.set(para.getKey(), total);
    total += rawLineLength(para, extensions) + 1;
  }

  const node = point.getNode();
  if (node.getKey() === root.getKey()) {
    const index = Math.min(point.offset, paragraphs.length);
    const para = paragraphs[index];
    if (!para) return Math.max(0, total - 1);
    return lineStart.get(para.getKey()) ?? null;
  }

  const para = point.type === "text" ? node.getParent() : node;
  if (para === null || !$isElementNode(para)) return null;
  const base = lineStart.get(para.getKey());
  if (base === undefined) return null;

  const children = para.getChildren();
  if (point.type === "text") {
    let within = 0;
    for (const child of children) {
      if (child.getKey() === node.getKey()) return base + within + point.offset;
      within += rawNodeLength(child, extensions);
    }
    return null;
  }
  let within = 0;
  for (let i = 0; i < Math.min(point.offset, children.length); i++) {
    within += rawNodeLength(children[i]!, extensions);
  }
  return base + within;
}

// Insert a raw markdown snippet at the caret, deserialized through the node
// extensions (so e.g. a `<ui-context …>` tag lands as its chip, not as literal
// text). With no live selection — the editor was never focused — the snippet
// appends at the end of the document. Must run inside an `editor.update()`.
export function $insertMarkdownSnippet(
  snippet: string,
  extensions: readonly NodeExtension[] = getNodeExtensions(),
): void {
  $insertTokenizedText(snippet, extensions);
}

// --- Selection mapping ------------------------------------------------------
// Map a character offset in the raw markdown `value` back to a Lexical point.
// This is the inverse of `applyMarkdownToEditor`: one paragraph per line,
// extension (decorator) nodes occupy exactly their serialized-token length, so
// offsets stay aligned with the source string the editor was built from.

type LexicalPoint = { key: string; offset: number; type: "text" | "element" };

// Raw-source length a node contributes (must mirror serializeEditorToMarkdown).
function rawNodeLength(
  node: LexicalNode,
  extensions: readonly NodeExtension[],
): number {
  if ($isLineBreakNode(node)) return 1;
  if ($isTextNode(node)) return node.getTextContent().length;
  for (const ext of extensions) {
    const s = ext.serializeNode(node);
    if (s !== null) return s.length;
  }
  return node.getTextContent().length;
}

// Raw-source length of one top-level line (its children, no trailing "\n").
function rawLineLength(
  para: LexicalNode,
  extensions: readonly NodeExtension[],
): number {
  if (!$isElementNode(para)) return rawNodeLength(para, extensions);
  return para
    .getChildren()
    .reduce((acc, child) => acc + rawNodeLength(child, extensions), 0);
}

// Resolve an offset within a single paragraph to a Lexical point. Text nodes
// resolve to an exact intra-text offset; decorator nodes snap to the element
// boundary before/after the node (you can't place a caret inside an image).
function pointInParagraph(
  para: ElementNode,
  offset: number,
  extensions: readonly NodeExtension[],
): LexicalPoint {
  const children = para.getChildren();
  let rem = offset;
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if ($isTextNode(child)) {
      const len = child.getTextContent().length;
      if (rem <= len) return { key: child.getKey(), offset: rem, type: "text" };
      rem -= len;
    } else {
      const len = rawNodeLength(child, extensions);
      if (rem <= 0) return { key: para.getKey(), offset: i, type: "element" };
      if (rem < len)
        return { key: para.getKey(), offset: i + 1, type: "element" };
      rem -= len;
    }
  }
  return { key: para.getKey(), offset: children.length, type: "element" };
}

function locatePoint(
  paragraphs: LexicalNode[],
  offset: number,
  extensions: readonly NodeExtension[],
): LexicalPoint | null {
  let rem = offset;
  let lastPara: ElementNode | null = null;
  for (const para of paragraphs) {
    if (!$isElementNode(para)) continue;
    lastPara = para;
    const lineLen = rawLineLength(para, extensions);
    if (rem <= lineLen) return pointInParagraph(para, rem, extensions);
    rem -= lineLen + 1; // consume the line plus its trailing "\n" separator
  }
  if (!lastPara) return null;
  return pointInParagraph(
    lastPara,
    rawLineLength(lastPara, extensions),
    extensions,
  );
}

// Set the editor selection to the raw-string character range [start, end].
// Must run inside an `editor.update()` (Lexical "$" convention).
export function $selectMarkdownRange(
  start: number,
  end: number,
  extensions: readonly NodeExtension[] = getNodeExtensions(),
): void {
  const paragraphs = $getRoot().getChildren();
  const anchor = locatePoint(paragraphs, start, extensions);
  const focus = locatePoint(paragraphs, end, extensions);
  if (!anchor || !focus) return;
  const selection = $createRangeSelection();
  selection.anchor.set(anchor.key, anchor.offset, anchor.type);
  selection.focus.set(focus.key, focus.offset, focus.type);
  $setSelection(selection);
}

export function clearEditor(editor: LexicalEditor): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    root.append($createParagraphNode());
  });
}
