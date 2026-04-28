import { useEffect } from "react";
import {
  $getSelection,
  $isRangeSelection,
  $insertNodes,
  COMMAND_PRIORITY_NORMAL,
  PASTE_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createImageNode } from "./image-node";

export function ImagePastePlugin({
  onError,
}: {
  onError?: (msg: string) => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand<ClipboardEvent>(
      PASTE_COMMAND,
      (event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        const imageItems = Array.from(clipboard.items).filter(
          (it) => it.kind === "file" && it.type.startsWith("image/"),
        );
        if (imageItems.length === 0) return false;

        event.preventDefault();
        Promise.all(
          imageItems.map(async (item) => {
            const blob = item.getAsFile();
            if (!blob) return null;
            const dataUrl = await blobToDataUrl(blob);
            return { mime: blob.type, dataUrl };
          }),
        )
          .then((results) => {
            editor.update(() => {
              const selection = $getSelection();
              if (!$isRangeSelection(selection)) return;
              const nodes = results
                .filter((r): r is { mime: string; dataUrl: string } => !!r)
                .map((r) =>
                  $createImageNode({
                    id: crypto.randomUUID(),
                    mime: r.mime,
                    dataUrl: r.dataUrl,
                  }),
                );
              if (nodes.length > 0) $insertNodes(nodes);
            });
          })
          .catch((err) => {
            onError?.(err instanceof Error ? err.message : String(err));
          });
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );
  }, [editor, onError]);

  return null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.readAsDataURL(blob);
  });
}
