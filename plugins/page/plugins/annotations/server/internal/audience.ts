import { Editor } from "@plugins/page/plugins/editor/server";

/**
 * Block types whose handle declares `audience: "human"` — the rows an agent
 * must never receive, and with them their whole subtree.
 *
 * The family's one statement of that predicate, read by both consumers of the
 * audience axis: `agent-access` (the redacted read and write walks) and
 * `instructions` (which skips an instructions block sitting inside a private
 * card). Two copies would be two answers to "is this withheld?", and the one
 * that drifted would leak.
 *
 * Read at CALL time, never memoized — the same rule `blockTextProtectedSpans()`
 * and `serverMarkdownContext()` state for the same reason: a snapshot taken
 * before `collectContributions` silently degrades to the EMPTY set, and here the
 * empty set means "redact nothing", i.e. leak. There is no cheap way to notice
 * that, and the leak is in the direction that cannot be undone.
 */
export function humanAudienceTypes(): Set<string> {
  return new Set(
    Editor.BlockData.getContributions()
      .filter((h) => h.audience === "human")
      .map((h) => h.type),
  );
}
