import { parseUiContext } from "@plugins/primitives/plugins/ui-context/core";
import { UiContextChip } from "./ui-context-chip";

// Inline-chip renderer for the `<ui-context …>` token. Receives the raw matched
// substring; parses it back into structured metadata and renders the chip. Used
// identically by every surface that renders the chip registry (the Lexical
// editor via the generic inline-chip node, and markdown / user-text via
// active-data's linkify).
export function UiContextTag({
  content,
}: {
  content: string;
  attrs: Record<string, string>;
}) {
  const meta = parseUiContext(content);
  return meta ? <UiContextChip meta={meta} /> : <>{content}</>;
}
