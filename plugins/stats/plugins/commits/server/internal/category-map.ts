import { db } from "@plugins/database/server";
import { getConfig } from "@plugins/config_v2/server";
import { conversationCategory, conversationCategoryConfig } from "@plugins/conversations/plugins/conversation-category/server";

const UNKNOWN = "Unknown";
const t = conversationCategory.table;

export async function buildCategoryMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({ conversationId: t.parentId, category: t.category })
    .from(t);
  const map = new Map<string, string>();
  for (const r of rows) map.set(r.conversationId, r.category);
  return map;
}

export function categoryFor(
  map: Map<string, string>,
  conversationId: string | null,
): string {
  if (!conversationId) return UNKNOWN;
  return map.get(conversationId) ?? UNKNOWN;
}

export function getConfigCategoryOrder(): string[] {
  const { categories } = getConfig(conversationCategoryConfig);
  return categories.map((c) => c.name);
}
