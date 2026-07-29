import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  blockPromptTasksResource,
  promptTaskOriginsResource,
  type PromptTaskLink,
  type PromptTaskOrigin,
} from "../shared/schemas";

const NO_LINKS: readonly PromptTaskLink[] = [];

// The tasks one prompt block has launched, oldest-first. Derived entirely from
// the link rows — the block stores no task ids — so a deleted task drops out on
// its own (FK CASCADE) and a launch from another tab shows up live.
//
// Empty while the resource is still hydrating: the consumer renders a chip row,
// and a spinner in place of zero-to-three chips would be noise. A block with no
// launches and a block that hasn't loaded both render nothing.
export function useBlockPromptTasks(blockId: string): readonly PromptTaskLink[] {
  const result = useResource(blockPromptTasksResource, { blockId });
  return useMemo(() => {
    if (result.pending) return NO_LINKS;
    return [...result.data].sort(
      (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
    );
  }, [result]);
}

// The page/block a task was launched from, or null when the task did not come
// from a prompt block (and while the resource is still hydrating). The `blockId`
// may dangle — the block can be deleted while the task lives on — so consumers
// must tolerate a page/block that no longer exists.
export function usePromptTaskLink(
  taskId: string | null | undefined,
): PromptTaskOrigin | null {
  const result = useResource(promptTaskOriginsResource);
  if (!taskId) return null;
  if (result.pending) return null;
  return result.data.find((row) => row.parentId === taskId) ?? null;
}
