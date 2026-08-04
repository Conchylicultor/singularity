import {
  Editor,
  blockTextProtectedSpans,
} from "@plugins/page/plugins/editor/server";
import type { MarkdownContext } from "@plugins/page/plugins/editor/core";

/**
 * The `MarkdownContext` the server converts a page with — the one place the two
 * halves of the contract are assembled, so `read_page` and `write_page` can
 * never run the round trip against different handle sets or different protected
 * spans (which would make an apply a diff against a document nobody ever saw).
 *
 * Built at CALL time, never memoized. `blockTextProtectedSpans` states the same
 * rule for the same reason: a snapshot taken before `collectContributions` would
 * silently degrade to no protection, and there is no cheap way to notice.
 */
export function serverMarkdownContext(): MarkdownContext {
  return {
    handles: [...Editor.BlockData.getContributions()],
    protectedSpans: blockTextProtectedSpans(),
  };
}
