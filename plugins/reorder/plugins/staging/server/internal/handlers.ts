import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  reorderDirectiveDescriptor,
  reorderableSlots,
} from "@plugins/reorder/server";
import {
  stageReorderDefault,
  applyReorderDefault,
  applyAllReorderDefaults,
  discardReorderDefault,
} from "../../core/endpoints";
import { _reorderStagedDefault } from "./tables";
import { stagedReorderDefaultsResource } from "./resource";
import { landDefaultsJob } from "./land-job";

export const handleStageReorderDefault = implement(
  stageReorderDefault,
  async ({ body }) => {
    const { slotId, pluginId, items } = body;

    // Structural enforcement: the slot must be a real reorderable slot AND its
    // descriptor must opt into git promotion. This refuses a hand-crafted
    // request for a non-reorder (or non-promotable) slot — the guarantee is the
    // slot registry + a descriptor flag, never the name of a specific config.
    const isReorderSlot = reorderableSlots.some((s) => s.slotId === slotId);
    const descriptor = reorderDirectiveDescriptor(slotId);
    if (!isReorderSlot || descriptor.promotableToGit !== true) {
      throw new HttpError(403, "This config is not promotable to a git default.");
    }

    // Last-write-wins per slot.
    await db
      .insert(_reorderStagedDefault)
      .values({
        slotId,
        pluginId,
        items,
        authorId: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: _reorderStagedDefault.slotId,
        set: { pluginId, items, updatedAt: new Date() },
      });

    stagedReorderDefaultsResource.notify();
    // return undefined → 204
  },
);

export const handleApplyReorderDefault = implement(
  applyReorderDefault,
  async ({ params }) => {
    const { slotId } = params;

    const [row] = await db
      .select({ slotId: _reorderStagedDefault.slotId })
      .from(_reorderStagedDefault)
      .where(eq(_reorderStagedDefault.slotId, slotId))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!row) throw new HttpError(404, "No staged reorder default for this slot.");

    // Heavy git worktree + push work must not block the HTTP handler: enqueue
    // the non-blocking landing job. It validates, writes the committed override
    // via a throwaway worktree off main, pushes, drains the landed row, and
    // notifies the live resource so the pane updates when the row disappears.
    await landDefaultsJob.enqueue({ slotIds: [slotId] });
    // return undefined → 204
  },
);

export const handleApplyAllReorderDefaults = implement(
  applyAllReorderDefaults,
  async () => {
    // Land every staged default in a single push (one throwaway worktree).
    await landDefaultsJob.enqueue({});
    // return undefined → 204
  },
);

export const handleDiscardReorderDefault = implement(
  discardReorderDefault,
  async ({ params }) => {
    await db
      .delete(_reorderStagedDefault)
      .where(eq(_reorderStagedDefault.slotId, params.slotId));
    stagedReorderDefaultsResource.notify();
    // return undefined → 204
  },
);
