import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { resolveIconSvgNodesJson } from "@plugins/primitives/plugins/avatar/server";
import { _agents } from "./tables";

export async function backfillAgentSvgNodes(): Promise<void> {
  const rows = await db
    .select({ id: _agents.id, icon: _agents.icon })
    .from(_agents)
    .where(and(isNotNull(_agents.icon), isNull(_agents.iconSvgNodes)));

  if (rows.length === 0) return;

  for (const row of rows) {
    if (!row.icon) continue;
    const svgJson = await resolveIconSvgNodesJson(row.icon);
    if (!svgJson) continue;
    await db
      .update(_agents)
      .set({ iconSvgNodes: svgJson })
      .where(eq(_agents.id, row.id));
  }
}
