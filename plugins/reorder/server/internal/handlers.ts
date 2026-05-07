import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _reorderPrefs } from "./tables";
import { reorderPrefsResource } from "./resource";

export async function handleGetSlot(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const slotId = params.slotId;
  if (!slotId) {
    return Response.json({ error: "slotId required" }, { status: 400 });
  }
  const rows = await db
    .select({
      contributionId: _reorderPrefs.contributionId,
      rank: _reorderPrefs.rank,
      hidden: _reorderPrefs.hidden,
    })
    .from(_reorderPrefs)
    .where(eq(_reorderPrefs.slotId, slotId));
  const out: Record<string, { rank?: string; hidden: boolean }> = {};
  for (const r of rows)
    out[r.contributionId] = {
      rank: (r.rank as string) ?? undefined,
      hidden: r.hidden,
    };
  return Response.json(out);
}

export async function handlePatchSlot(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const slotId = params.slotId;
  if (!slotId) {
    return Response.json({ error: "slotId required" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as
    | { contributionId?: string; rank?: string; hidden?: boolean }
    | null;
  if (
    !body ||
    typeof body.contributionId !== "string" ||
    body.contributionId.length === 0
  ) {
    return Response.json(
      { error: "body.contributionId must be a non-empty string" },
      { status: 400 },
    );
  }

  const hasRank = typeof body.rank === "string" && body.rank.length > 0;
  const hasHidden = typeof body.hidden === "boolean";
  if (!hasRank && !hasHidden) {
    return Response.json(
      { error: "body must include rank (string) and/or hidden (boolean)" },
      { status: 400 },
    );
  }

  if (hasRank && !hasHidden) {
    await db
      .insert(_reorderPrefs)
      .values({ slotId, contributionId: body.contributionId, rank: body.rank })
      .onConflictDoUpdate({
        target: [_reorderPrefs.slotId, _reorderPrefs.contributionId],
        set: { rank: body.rank },
      });
  } else if (hasHidden && !hasRank) {
    await db
      .insert(_reorderPrefs)
      .values({
        slotId,
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
        slotId,
        contributionId: body.contributionId,
        rank: body.rank,
        hidden: body.hidden,
      })
      .onConflictDoUpdate({
        target: [_reorderPrefs.slotId, _reorderPrefs.contributionId],
        set: { rank: body.rank, hidden: body.hidden },
      });
  }

  reorderPrefsResource.notify({ slotId });
  return Response.json({ ok: true });
}
