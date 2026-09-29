import type { MarkdownContext } from "../../core";
import { blockTextProtectedSpans } from "./block-text-extensions";
import { useBlockHandles } from "./block-handles";

/**
 * The page's OWN markdown dialect, bound to this runtime's registry: every
 * registered block handle plus the inline tokens' protected spans — the pair
 * `parseMarkdownToForest` / `serializeForestToMarkdown` need and a block
 * plugin cannot assemble itself (neither is exported on its own).
 *
 * The dialect is the exact round trip `read_page` / `edit_page` speak: a blank
 * line is an empty paragraph, an empty paragraph a blank line cannot place is
 * pinned, and a soft break is the two characters `\n`. For a block that edits
 * its own markdown SOURCE in place (the table's source mode), where what the
 * user sees must read back as exactly what it came from.
 *
 * Built per call rather than memoized: the protected-span registry can grow
 * after mount (a lazily loaded token family), and every caller reads it in an
 * event handler, where a fresh read costs one registry scan.
 */
export function usePageMarkdownContext(): () => MarkdownContext {
  const handles = useBlockHandles();
  return () => ({
    handles: [...handles.values()],
    protectedSpans: blockTextProtectedSpans(),
    blankLines: "empty-block",
    emptyBlocks: "pinned",
    softBreaks: "escaped",
  });
}
