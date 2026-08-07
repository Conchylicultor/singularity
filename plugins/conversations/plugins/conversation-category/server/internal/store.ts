import { and, eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { categoryRowId } from "../../shared/row-id";
import { _conversationCategories } from "./tables";

const t = _conversationCategories;

export interface CategoryAssignment {
  categoryId: string;
  item: string;
  source: "haiku" | "manual";
}

/** Every category currently assigned to one conversation, keyed by category id. */
export async function getCategoryRows(
  conversationId: string,
): Promise<Map<string, CategoryAssignment>> {
  const rows = await db
    .select({ categoryId: t.categoryId, item: t.item, source: t.source })
    .from(t)
    .where(eq(t.conversationId, conversationId));
  return new Map(rows.map((r) => [r.categoryId, r]));
}

/**
 * Write several category assignments for one conversation.
 *
 * ONE statement, deliberately: the change feed emits per commit, so a single
 * multi-row upsert delivers one push carrying every category the classifier
 * resolved, instead of N pushes that each re-render the header.
 */
export async function upsertCategoryRows(
  conversationId: string,
  entries: readonly { categoryId: string; item: string }[],
  source: "haiku" | "manual",
): Promise<void> {
  if (entries.length === 0) return;
  const now = new Date();
  await db
    .insert(t)
    .values(
      entries.map((e) => ({
        id: categoryRowId(conversationId, e.categoryId),
        conversationId,
        categoryId: e.categoryId,
        item: e.item,
        source,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: t.id,
      set: {
        item: sql`excluded.item`,
        source: sql`excluded.source`,
        updatedAt: now,
      },
    });
}

export async function deleteCategoryRow(
  conversationId: string,
  categoryId: string,
): Promise<void> {
  await db
    .delete(t)
    .where(
      and(eq(t.conversationId, conversationId), eq(t.categoryId, categoryId)),
    );
}

/**
 * Every conversation's item within ONE category, keyed by conversation id.
 * The cross-plugin read (stats/commits) — kept here so this plugin's pgTable
 * never leaves `internal/`.
 */
export async function getItemMap(
  categoryId: string,
): Promise<Map<string, string>> {
  const rows = await db
    .select({ conversationId: t.conversationId, item: t.item })
    .from(t)
    .where(eq(t.categoryId, categoryId));
  return new Map(rows.map((r) => [r.conversationId, r.item]));
}
