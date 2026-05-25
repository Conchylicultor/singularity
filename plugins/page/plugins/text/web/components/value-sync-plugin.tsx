import { useEffect, useRef } from "react";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

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
        if (line.length > 0) {
          paragraph.append($createTextNode(line));
        }
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
      editor.getEditorState().read(() => {
        const text = $getRoot().getTextContent();
        if (text === lastSerializedRef.current) return;
        lastSerializedRef.current = text;
        onChangeRef.current(text);
      });
    });
  }, [editor]);

  return null;
}
