import {
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  type ElementNode,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import type { ComponentType } from "react";
import type { Block } from "../../core";
import type { BlockEditorAPI } from "../types";

/** Props every contributed block-text Lexical plugin receives. */
export interface BlockTextPluginProps {
  block: Block;
  editor: BlockEditorAPI;
}

/**
 * A custom inline node for the block text editor, plus the (de)serialization
 * rules that round-trip it through the block's plain-text `data.text` string.
 *
 * Mirrors the text-editor primitive's `NodeExtension` (see
 * `plugins/primitives/plugins/text-editor/web/internal/node-extensions.ts`) so
 * the two editors share one mental model. The block editor stores plain text, so
 * inline nodes survive as text tokens (e.g. `[[<pageId>]]`) — `serializeNode`
 * writes the token, `deserializePattern` + `createNodeFromMatch` parse it back.
 */
export interface BlockTextExtension {
  /** Stable id (used as a React key when rendering `Plugin`). */
  id: string;
  /** Lexical node class registered in every block editor's config. */
  node: Klass<LexicalNode>;
  /** Non-global regex matching this extension's token within a single line. */
  deserializePattern: RegExp;
  /** Build the inline node for a regex match (return null to skip). */
  createNodeFromMatch: (match: RegExpExecArray) => LexicalNode | null;
  /** Serialize a custom node to its token (return null if not this node). */
  serializeNode: (node: LexicalNode) => string | null;
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
  return extensions.map((e) => e.node);
}

/**
 * Append the parsed content of one text line into a paragraph, materializing any
 * extension tokens as their inline nodes. Mirrors the text-editor primitive's
 * `applyMarkdownToEditor` line loop (overlap guard + sort by start). Must be
 * called inside an `editor.update()`.
 */
export function appendLineNodes(para: ElementNode, line: string): void {
  if (extensions.length === 0) {
    if (line) para.append($createTextNode(line));
    return;
  }
  type Match = { start: number; end: number; node: LexicalNode };
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
}

/**
 * Serialize the editor's content back to the stored plain-text string. Walks each
 * paragraph's children: line breaks → `\n`, text nodes → their text, custom nodes
 * → the first extension `serializeNode` that claims them (fallback
 * `getTextContent`). Keeping inline nodes' own `getTextContent()` empty ensures
 * tokens never leak into live root-text reads (slash menu, `[[` query scan).
 */
export function serializeBlockText(editor: LexicalEditor): string {
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
