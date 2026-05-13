import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { resolveIconSvgNodesJson } from "@plugins/primitives/plugins/avatar/server";
import { _conversationCategoryColors } from "./tables-colors";

export async function backfillCategoryColorsSvgNodes(): Promise<void> {
  const rows = await db
    .select({ category: _conversationCategoryColors.category, iconKey: _conversationCategoryColors.iconKey })
    .from(_conversationCategoryColors)
    .where(and(isNotNull(_conversationCategoryColors.iconKey), isNull(_conversationCategoryColors.iconSvgNodes)));

  if (rows.length === 0) return;

  for (const row of rows) {
    if (!row.iconKey) continue;
    const svgJson = await resolveIconSvgNodesJson(row.iconKey);
    if (!svgJson) continue;
    await db
      .update(_conversationCategoryColors)
      .set({ iconSvgNodes: svgJson })
      .where(eq(_conversationCategoryColors.category, row.category));
  }
}
