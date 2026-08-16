import { HighlightedCode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";

/**
 * A page document as the tools speak it: markdown source, not rendered prose.
 * Highlighted rather than formatted on purpose — the `<agent-note id="…">` and
 * `<page id="…"/>` tags in it are addresses the agent read and wrote back, and
 * rendering them away would hide the part that matters.
 */
export function PageMarkdown({ text }: { text: string }) {
  return (
    <Scroll axis="both" className="max-h-[360px]">
      <HighlightedCode code={text} lang="markdown" />
    </Scroll>
  );
}
