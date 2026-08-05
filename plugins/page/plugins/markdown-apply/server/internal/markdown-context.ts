import {
  Editor,
  blockTextProtectedSpans,
} from "@plugins/page/plugins/editor/server";
import type { MarkdownContext } from "@plugins/page/plugins/editor/core";

/**
 * The `MarkdownContext` the server converts a page with — the one place the two
 * halves of the contract are assembled, so no two ends of the round trip can run
 * against different handle sets or different protected spans (which would make
 * an apply a diff against a document nobody ever saw). Exported from the server
 * barrel for the same reason: a writer that parses markdown destined for this
 * forest without going through the applier — `annotations/agent-access`'s
 * creates-only append — must parse it in the same dialect.
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
