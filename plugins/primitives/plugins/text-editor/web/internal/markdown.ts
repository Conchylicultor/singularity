import {
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  $createParagraphNode,
  $createTextNode,
  $createRangeSelection,
  $setSelection,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
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

export function applyMarkdownToEditor(
  editor: LexicalEditor,
  markdown: string,
  extensions: readonly NodeExtension[] = getNodeExtensions(),
): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const lines = markdown.split("\n");
    for (const line of lines) {
      const para = $createParagraphNode();
      if (extensions.length > 0) {
        type Match = { start: number; end: number; node: import("lexical").LexicalNode };
        const matches: Match[] = [];
        for (const ext of extensions) {
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
          const before = line.slice(lastIdx, match.start);
          if (before) para.append($createTextNode(before));
          para.append(match.node);
          lastIdx = match.end;
        }
        const tail = line.slice(lastIdx);
        if (tail) para.append($createTextNode(tail));
      } else {
        if (line) para.append($createTextNode(line));
      }
      root.append(para);
    }
    if (root.getChildrenSize() === 0) {
      root.append($createParagraphNode());
    }
  });
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
      if (rem < len) return { key: para.getKey(), offset: i + 1, type: "element" };
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
    const lineLen = para
      .getChildren()
      .reduce((acc, child) => acc + rawNodeLength(child, extensions), 0);
    if (rem <= lineLen) return pointInParagraph(para, rem, extensions);
    rem -= lineLen + 1; // consume the line plus its trailing "\n" separator
  }
  if (!lastPara) return null;
  const lineLen = lastPara
    .getChildren()
    .reduce((acc, child) => acc + rawNodeLength(child, extensions), 0);
  return pointInParagraph(lastPara, lineLen, extensions);
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
