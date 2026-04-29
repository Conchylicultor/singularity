import {
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  $createParagraphNode,
  $createTextNode,
  type LexicalEditor,
} from "lexical";
import {
  ATTACHMENT_MARKDOWN_RE,
  attachmentMarkdown,
  isAttachmentUrl,
} from "../../shared";
import { $createImageNode, $isImageNode } from "./image-node";

// Editor state → markdown. Each paragraph emits a line; image nodes become
// `![alt](/api/attachments/<id>)`; line-breaks within a paragraph become "\n".
export function serializeEditorToMarkdown(editor: LexicalEditor): string {
  const lines: string[] = [];
  editor.getEditorState().read(() => {
    const root = $getRoot();
    for (const para of root.getChildren()) {
      if (!$isElementNode(para)) continue;
      let buf = "";
      for (const child of para.getChildren()) {
        if ($isImageNode(child)) {
          buf += attachmentMarkdown(child.getAttachmentId(), child.getAlt());
        } else if ($isLineBreakNode(child)) {
          buf += "\n";
        } else if ($isTextNode(child)) {
          buf += child.getTextContent();
        }
      }
      lines.push(buf);
    }
  });
  return lines.join("\n");
}

// Markdown → editor state. Splits on \n into paragraphs, scans each line for
// attachment-url image references, replaces those with ImageNodes; the rest
// stays as plain text. Non-attachment markdown image refs are preserved as
// literal text (we don't render arbitrary URLs as inline images).
export function applyMarkdownToEditor(
  editor: LexicalEditor,
  markdown: string,
): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const lines = markdown.split("\n");
    for (const line of lines) {
      const para = $createParagraphNode();
      let lastIdx = 0;
      const re = new RegExp(ATTACHMENT_MARKDOWN_RE.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const attachmentId = isAttachmentUrl(m[2]!);
        if (!attachmentId) continue;
        const before = line.slice(lastIdx, m.index);
        if (before) para.append($createTextNode(before));
        para.append(
          $createImageNode({ attachmentId, alt: m[1] ?? "" }),
        );
        lastIdx = m.index + m[0].length;
      }
      const tail = line.slice(lastIdx);
      if (tail) para.append($createTextNode(tail));
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
