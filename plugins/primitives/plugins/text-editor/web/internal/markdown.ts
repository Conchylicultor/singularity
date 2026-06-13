import {
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  $createParagraphNode,
  $createTextNode,
  type LexicalEditor,
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

export function clearEditor(editor: LexicalEditor): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    root.append($createParagraphNode());
  });
}
