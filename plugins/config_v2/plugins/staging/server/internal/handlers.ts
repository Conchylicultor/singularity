import { and, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  stageConfigDefault,
  applyConfigDefault,
  applyAllConfigDefaults,
  discardConfigDefault,
  discardAllConfigDefaults,
} from "../../core/endpoints";
import { _stagedConfigDefault } from "./tables";
import { findPromotableDescriptor } from "./registry-lookup";
import { stagedConfigDefaultsResource } from "./resource";
import { landDefaultsJob } from "./land-job";

// Match a single staged row by its composite key.
function rowKey(pluginId: string, configName: string) {
  return and(
    eq(_stagedConfigDefault.pluginId, pluginId),
    eq(_stagedConfigDefault.configName, configName),
  );
}

export const handleStageConfigDefault = implement(
  stageConfigDefault,
  async ({ body }) => {
    const { pluginId, configName, value } = body;

    // Structural enforcement: the descriptor must be registered AND opt into git
    // promotion (`promotableToGit: true`). This refuses a hand-crafted request
    // for a non-promotable config — the guarantee is the config_v2 registry + a
    // descriptor flag, never the name of a specific config.
    const descriptor = findPromotableDescriptor(pluginId, configName);
    if (!descriptor) {
      throw new HttpError(403, "This config is not promotable to a git default.");
    }

    // Last-write-wins per (pluginId, configName).
    await db
      .insert(_stagedConfigDefault)
      .values({
        pluginId,
        configName,
        value,
        authorId: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [_stagedConfigDefault.pluginId, _stagedConfigDefault.configName],
        set: { value, updatedAt: new Date() },
      });

    stagedConfigDefaultsResource.notify();
    // return undefined → 204
  },
);

export const handleApplyConfigDefault = implement(
  applyConfigDefault,
  async ({ params }) => {
    const { pluginId, configName } = params;

    const [row] = await db
      .select({ pluginId: _stagedConfigDefault.pluginId })
      .from(_stagedConfigDefault)
      .where(rowKey(pluginId, configName))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!row) throw new HttpError(404, "No staged config default for this descriptor.");

    // Heavy git worktree + push work must not block the HTTP handler: enqueue
    // the non-blocking landing job. It validates, writes the committed override
    // via a throwaway worktree off main, pushes, drains the landed row, and
    // notifies the live resource so the pane updates when the row disappears.
    await landDefaultsJob.enqueue({ keys: [{ pluginId, configName }] });
    // return undefined → 204
  },
);

export const handleApplyAllConfigDefaults = implement(
  applyAllConfigDefaults,
  async () => {
    // Land every staged default in a single push (one throwaway worktree).
    await landDefaultsJob.enqueue({});
    // return undefined → 204
  },
);

export const handleDiscardConfigDefault = implement(
  discardConfigDefault,
  async ({ params }) => {
    await db
      .delete(_stagedConfigDefault)
      .where(rowKey(params.pluginId, params.configName));
    stagedConfigDefaultsResource.notify();
    // return undefined → 204
  },
);

export const handleDiscardAllConfigDefaults = implement(
  discardAllConfigDefaults,
  async () => {
    await db.delete(_stagedConfigDefault);
    stagedConfigDefaultsResource.notify();
    // return undefined → 204
  },
);
