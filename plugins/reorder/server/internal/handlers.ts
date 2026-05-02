import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
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
    })
    .from(_reorderPrefs)
    .where(eq(_reorderPrefs.slotId, slotId));
  const out: Record<string, { rank: string }> = {};
  for (const r of rows) out[r.contributionId] = { rank: r.rank };
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
    | { contributionId?: string; rank?: string }
    | null;
  if (
    !body ||
    typeof body.contributionId !== "string" ||
    typeof body.rank !== "string" ||
    body.contributionId.length === 0 ||
    body.rank.length === 0
  ) {
    return Response.json(
      { error: "body must be { contributionId: string; rank: string }" },
      { status: 400 },
    );
  }

  await db
    .insert(_reorderPrefs)
    .values({
      slotId,
      contributionId: body.contributionId,
      rank: body.rank,
    })
    .onConflictDoUpdate({
      target: [_reorderPrefs.slotId, _reorderPrefs.contributionId],
      set: { rank: body.rank },
    });

  reorderPrefsResource.notify({ slotId });
  return Response.json({ ok: true });
}
