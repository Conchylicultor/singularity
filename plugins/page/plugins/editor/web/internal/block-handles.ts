// The web-side `type → BlockHandle` view of the `Editor.Block` registry.
//
// The pure reducer (`applyBlockOp`) and the keystroke resolver both need type
// FACTS the block forest cannot supply — today "which types are container
// anchors" and "which types carry text". Those live on the block handle, which
// rides on the `Editor.Block` contribution as `BlockMeta.block`. Deriving them
// here, once, is what keeps every consumer honest: the client overlay and the
// server MUST pass the SAME `anchorTypes` to `applyBlockOp`, or an op applies
// differently on each side and can never confirm.
//
// Derived from the slot's own registrations (never a second hand-maintained
// list), exactly as `useFramedBlockTypes` derives the container set from
// `Editor.BlockFrame` — adding or removing a block-type plugin updates every
// consumer with zero code changes.

import { useMemo } from "react";
import {
  blockOpContextOf,
  type BlockHandle,
  type BlockOpContext,
} from "../../core";
import { Editor } from "../slots";

/**
 * The reducer's type facts as ONE object, derived from this runtime's registry
 * through the shared `blockOpContextOf`. The server mints its own from its own
 * registry through the SAME function, which is what makes "both sides pass the
 * same context" structural rather than a convention two filters have to keep.
 *
 * Stable across renders, so the optimistic overlay's `apply` closure does not
 * churn. A new reducer fact costs one field here, not one parameter on each of
 * the seams between this hook and `applyBlockOp`.
 */
export function useBlockOpContext(): BlockOpContext {
  const contributions = Editor.Block.useContributions();
  return useMemo(
    () => blockOpContextOf(contributions.map((c) => c.block)),
    [contributions],
  );
}

/** Every registered block type's handle, keyed by `type`. */
export function useBlockHandles(): ReadonlyMap<string, BlockHandle<unknown>> {
  const contributions = Editor.Block.useContributions();
  return useMemo(
    () => new Map(contributions.map((c) => [c.block.type, c.block])),
    [contributions],
  );
}

/**
 * The block types declaring `BlockHandle.anchor` — the reducer's `BlockOpContext`
 * input (the empty-anchor prune plus the split/merge refusals). Stable across
 * renders, so the optimistic overlay's `apply` closure does not churn.
 */
export function useAnchorTypes(): ReadonlySet<string> {
  const contributions = Editor.Block.useContributions();
  return useMemo(
    () =>
      new Set(
        contributions.filter((c) => c.block.anchor).map((c) => c.block.type),
      ),
    [contributions],
  );
}
