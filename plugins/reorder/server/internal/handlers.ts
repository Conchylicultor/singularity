import { and, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getSlot, patchSlot, deleteContribution } from "../../shared/endpoints";
import { _reorderPrefs } from "./tables";
import { reorderPrefsResource } from "./resource";

export const handleGetSlot = implement(getSlot, async ({ params }) => {
  const rows = await db
    .select({
      contributionId: _reorderPrefs.contributionId,
      rank: _reorderPrefs.rank,
      hidden: _reorderPrefs.hidden,
    })
    .from(_reorderPrefs)
    .where(eq(_reorderPrefs.slotId, params.slotId));
  const out: Record<string, { rank?: string; hidden: boolean }> = {};
  for (const r of rows)
    out[r.contributionId] = {
      rank: r.rank as string,
      hidden: r.hidden,
    };
  return out;
});

const SPACER_PREFIX = "__spacer__";

export const handlePatchSlot = implement(patchSlot, async ({ params, body }) => {
  const hasRank = typeof body.rank === "string" && body.rank.length > 0;
  const hasHidden = typeof body.hidden === "boolean";
  if (!hasRank && !hasHidden) {
    throw new HttpError(400, "body must include rank (string) and/or hidden (boolean)");
  }

  if (hasRank && !hasHidden) {
    await db
      .insert(_reorderPrefs)
      .values({ slotId: params.slotId, contributionId: body.contributionId, rank: body.rank })
      .onConflictDoUpdate({
        target: [_reorderPrefs.slotId, _reorderPrefs.contributionId],
        set: { rank: body.rank },
      });
  } else if (hasHidden && !hasRank) {
    await db
      .insert(_reorderPrefs)
      .values({
        slotId: params.slotId,
        contributionId: body.contributionId,
        hidden: body.hidden,
      })
      .onConflictDoUpdate({
        target: [_reorderPrefs.slotId, _reorderPrefs.contributionId],
        set: { hidden: body.hidden },
      });
  } else {
    await db
      .insert(_reorderPrefs)
      .values({
        slotId: params.slotId,
        contributionId: body.contributionId,
        rank: body.rank,
        hidden: body.hidden,
      })
      .onConflictDoUpdate({
        target: [_reorderPrefs.slotId, _reorderPrefs.contributionId],
        set: { rank: body.rank, hidden: body.hidden },
      });
  }

  reorderPrefsResource.notify({ slotId: params.slotId });
  return { ok: true };
});

export const handleDeleteContribution = implement(
  deleteContribution,
  async ({ params }) => {
    if (!params.contributionId.startsWith(SPACER_PREFIX)) {
      throw new HttpError(400, "Only spacer rows may be deleted");
    }
    await db
      .delete(_reorderPrefs)
      .where(
        and(
          eq(_reorderPrefs.slotId, params.slotId),
          eq(_reorderPrefs.contributionId, params.contributionId),
        ),
      );
    reorderPrefsResource.notify({ slotId: params.slotId });
    return { ok: true };
  },
);
