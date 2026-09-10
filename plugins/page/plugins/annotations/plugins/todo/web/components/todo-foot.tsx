import type { BlockFootProps } from "@plugins/page/plugins/editor/web";
import { TodoRuns } from "@plugins/page/plugins/annotations/plugins/todo/plugins/task-link/web";

/**
 * The TODO card's foot: the agents it has dispatched, as chips at the bottom of
 * its box.
 *
 * This is the card's whole record of a launch. Everything about what the chips
 * say — one per run, oldest first, each opening its own conversation — lives in
 * `TodoRuns`; what lives HERE is the one thing a foot has to answer for itself,
 * which is when there is honestly nothing to render.
 *
 * ## A read-only surface gets no foot, and would crash rather than degrade
 *
 * `blockId` and `editor` are both optional on `BlockFootProps` and both absent
 * on a read-only surface (the blog renderer, the version-history preview) — a
 * read-only node may carry no id, and there is no block API to hand a control.
 * Either one missing ⇒ nothing, for the two independent reasons `PromptFooter`
 * gives for the same call:
 *
 *  1. The chips are **live agent state, not document content.** A preview of
 *     last Tuesday showing today's runs would be a lie about the snapshot.
 *  2. They would **crash, not degrade** — `useOpenPane` and
 *     `conversationPane.useRouteEntries()` do not exist on the public-site
 *     surface.
 *
 * The card's box and its corner name DO render there, so a TODO still looks like
 * a TODO in a snapshot; it just cannot say what is being done about it.
 */
export function TodoFoot({ blockId, editor }: BlockFootProps) {
  if (!editor || blockId === undefined) return null;
  return <TodoRuns blockId={blockId} />;
}
