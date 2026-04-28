import {
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  $createParagraphNode,
  $createLineBreakNode,
  $createTextNode,
  type LexicalEditor,
} from "lexical";
import type {
  PromptDraft,
  PromptImageDraft,
} from "@plugins/conversations/plugins/conversation-view/web";
import { $createImageNode, $isImageNode } from "./image-node";

const TOKEN_RE = /<<<image:(\d+)>>>/g;

export function serializeEditorToDraft(editor: LexicalEditor): PromptDraft {
  const images: PromptImageDraft[] = [];
  const paragraphs: string[] = [];
  editor.getEditorState().read(() => {
    const root = $getRoot();
    for (const para of root.getChildren()) {
      if (!$isElementNode(para)) continue;
      let buf = "";
      for (const child of para.getChildren()) {
        if ($isImageNode(child)) {
          buf += `<<<image:${images.length}>>>`;
          images.push(child.getPayload());
        } else if ($isLineBreakNode(child)) {
          buf += "\n";
        } else if ($isTextNode(child)) {
          buf += child.getTextContent();
        }
      }
      paragraphs.push(buf);
    }
  });
  return { text: paragraphs.join("\n"), images };
}

export function applyDraftToEditor(
  editor: LexicalEditor,
  draft: PromptDraft,
): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const lines = draft.text.split("\n");
    for (const line of lines) {
      const para = $createParagraphNode();
      let lastIdx = 0;
      const re = new RegExp(TOKEN_RE.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const before = line.slice(lastIdx, m.index);
        if (before) para.append($createTextNode(before));
        const imgIdx = parseInt(m[1]!, 10);
        const img = draft.images[imgIdx];
        if (img) para.append($createImageNode(img));
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

// Build multipart FormData payload from the current draft.
// Each image becomes a form part named `image-N` matching its <<<image:N>>>
// token in the text. The server replaces tokens with `@<absolute-path>`
// after writing each image to disk.
export async function draftToTurnFormData(
  draft: PromptDraft,
): Promise<FormData> {
  const fd = new FormData();
  fd.append("text", draft.text);
  for (let i = 0; i < draft.images.length; i++) {
    const img = draft.images[i]!;
    const blob = await dataUrlToBlob(img.dataUrl);
    const ext = mimeToExt(img.mime);
    fd.append(`image-${i}`, blob, `paste-${i}.${ext}`);
  }
  return fd;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

// Re-exports so the editor barrel doesn't have to import each helper.
export { $createLineBreakNode };
