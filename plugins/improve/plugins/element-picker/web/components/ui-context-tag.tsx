import { parseUiContext } from "../../core";
import { UiContextChip } from "./ui-context-chip";

// active-data inline renderer for the `<ui-context …>` token. Receives the raw
// matched substring; parses it back into structured metadata and renders the
// chip. Used identically by every surface that renders message text (the Lexical
// editor via the node bridge, and markdown / user-text via linkify).
export function UiContextTag({ content }: { content: string; attrs: Record<string, string> }) {
  const meta = parseUiContext(content);
  return meta ? <UiContextChip meta={meta} /> : <>{content}</>;
}
