import { useEffect, useRef } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { runsOf, type RichText } from "../../core";
import { runsToLexical, serializeBlockRuns } from "../internal/block-text-extensions";
import { $caretOffsetWithinParagraph, $placeCaretAtOffset } from "../internal/caret-geometry";

/**
 * Two-way sync between the block's stored rich-text and the Lexical tree.
 *
 * `value` / `onChange` carry the **canonical JSON** of the runs (a stable string
 * key), so the self-write guard and change detection compare with a plain `===`
 * and never feedback-loop. Incoming value → `runsToLexical`; an editor update
 * (non-self) → `serializeBlockRuns` → canonical JSON → `onChange`.
 */
export function ValueSyncPlugin({
  value,
  onChange,
}: {
  /** Canonical JSON of the block's `RichText`. */
  value: string;
  /** Receives the canonical JSON of the edited `RichText`. */
  onChange: (json: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const selfWriteRef = useRef(false);
  const lastSerializedRef = useRef<string | null>(null);
  const onChangeRef = useLatestRef(onChange);

  useEffect(() => {
    if (lastSerializedRef.current === value) return;
    selfWriteRef.current = true;
    const runs: RichText = runsOf(JSON.parse(value));
    editor.update(() => {
      // Capture the caret before the rebuild so an external text change (e.g. a
      // Backspace-merge appending into this block) keeps a focused caret put
      // instead of snapping it to offset 0. Null when this editor isn't focused.
      const caret = $caretOffsetWithinParagraph();
      runsToLexical(runs);
      if (caret !== null) $placeCaretAtOffset(caret);
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
      const json = JSON.stringify(serializeBlockRuns(editor));
      if (json === lastSerializedRef.current) return;
      lastSerializedRef.current = json;
      onChangeRef.current(json);
    });
  }, [editor, onChangeRef]);

  return null;
}
