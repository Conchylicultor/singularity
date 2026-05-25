import { desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listTweakcnThemes } from "../../core/endpoints";
import { _tweakcnThemes } from "./tables";

export const handleList = implement(listTweakcnThemes, async () => {
  const rows = await db
    .select()
    .from(_tweakcnThemes)
    .orderBy(desc(_tweakcnThemes.createdAt));

  return rows.map((r) => ({
    id: r.id,
    tweakcnId: r.tweakcnId,
    label: r.label,
    presets: r.presets,
    createdAt: r.createdAt.toISOString(),
  }));
});
