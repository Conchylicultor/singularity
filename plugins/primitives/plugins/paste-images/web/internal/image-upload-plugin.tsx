import { useEffect } from "react";
import {
  $getSelection,
  $isRangeSelection,
  $insertNodes,
  COMMAND_PRIORITY_NORMAL,
  DROP_COMMAND,
  PASTE_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { $createImageNode } from "./image-node";

// Intercepts paste & drop events with `image/*` clipboard items. For each
// image, uploads to /api/attachments and inserts an inline `ImageNode`
// referencing the returned attachment id. The thumbnail then renders via
// `<img src=/api/attachments/:id>`. Non-image clipboard data falls through
// to Lexical's default paste handling.
export function ImageUploadPlugin({
  onError,
}: {
  onError?: (msg: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handle = (event: ClipboardEvent | DragEvent) => {
      const data =
        event instanceof DragEvent ? event.dataTransfer : event.clipboardData;
      if (!data) return false;
      const imageItems = Array.from(data.items).filter(
        (it) => it.kind === "file" && it.type.startsWith("image/"),
      );
      if (imageItems.length === 0) return false;

      event.preventDefault();
      Promise.all(
        imageItems.map(async (item) => {
          const blob = item.getAsFile();
          if (!blob) return null;
          const ext = mimeToExt(blob.type);
          const filename = blob.name && blob.name.length > 0 ? blob.name : `paste.${ext}`;
          const result = await uploadAttachment(blob, filename, blob.type);
          return result.id;
        }),
      )
        .then((ids) => {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            const nodes = ids
              .filter((id): id is string => typeof id === "string")
              .map((id) => $createImageNode({ attachmentId: id }));
            if (nodes.length > 0) $insertNodes(nodes);
          });
        })
        .catch((err) => {
          onError?.(err instanceof Error ? err.message : String(err));
        });
      return true;
    };

    const unregisterPaste = editor.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      handle,
      COMMAND_PRIORITY_NORMAL,
    );
    const unregisterDrop = editor.registerCommand<DragEvent>(
      DROP_COMMAND,
      handle,
      COMMAND_PRIORITY_NORMAL,
    );
    return () => {
      unregisterPaste();
      unregisterDrop();
    };
  }, [editor, onError]);

  return null;
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
