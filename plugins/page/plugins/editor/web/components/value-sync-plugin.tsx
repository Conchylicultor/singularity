import { useEffect, useRef } from "react";
import { $createParagraphNode, $getRoot } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { appendLineNodes, serializeBlockText } from "../internal/block-text-extensions";

export function ValueSyncPlugin({
  value,
  onChange,
}: {
  value: string;
  onChange: (text: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const selfWriteRef = useRef(false);
  const lastSerializedRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (lastSerializedRef.current === value) return;
    selfWriteRef.current = true;
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const lines = value.split("\n");
      for (const line of lines) {
        const paragraph = $createParagraphNode();
        appendLineNodes(paragraph, line);
        root.append(paragraph);
      }
    });
    lastSerializedRef.current = value;
    queueMicrotask(() => {
      selfWriteRef.current = false;
    });
  }, [editor, value]);

  useEffect(() => {
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (selfWriteRef.current) return;
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      const text = serializeBlockText(editor);
      if (text === lastSerializedRef.current) return;
      lastSerializedRef.current = text;
      onChangeRef.current(text);
    });
  }, [editor]);

  return null;
}
