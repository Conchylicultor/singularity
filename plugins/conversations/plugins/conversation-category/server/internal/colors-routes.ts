import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  getCategoryColors,
  setCategoryColor,
  deleteCategoryColor,
} from "../../shared/endpoints";
import { _conversationCategoryColors } from "./tables-colors";
import { categoryColorsResource } from "./colors-resource";

export const handleGetColors = implement(getCategoryColors, async () => {
  const rows = await db.select().from(_conversationCategoryColors);
  return Object.fromEntries(
    rows.map((r) => [r.category, {
      colorKey: r.colorKey ?? null,
      iconKey: r.iconKey ?? null,
      iconSvgNodes: r.iconSvgNodes ?? null,
    }]),
  );
});

export const handleSetColor = implement(setCategoryColor, async ({ body }) => {
  const { category, colorKey, iconKey, iconSvgNodes } = body;
  if (colorKey === undefined && iconKey === undefined) {
    throw new HttpError(400, "missing-fields");
  }

  if (colorKey === null && iconKey === null) {
    await db
      .delete(_conversationCategoryColors)
      .where(eq(_conversationCategoryColors.category, category));
    categoryColorsResource.notify();
    return { ok: true };
  }

  await db
    .insert(_conversationCategoryColors)
    .values({
      category,
      colorKey: colorKey ?? null,
      iconKey: iconKey ?? null,
      iconSvgNodes: iconSvgNodes ?? null,
    })
    .onConflictDoUpdate({
      target: _conversationCategoryColors.category,
      set: {
        ...(colorKey !== undefined ? { colorKey: colorKey ?? null } : {}),
        ...(iconKey !== undefined ? { iconKey: iconKey ?? null } : {}),
        ...(iconSvgNodes !== undefined ? { iconSvgNodes: iconSvgNodes ?? null } : {}),
        updatedAt: new Date(),
      },
    });
  categoryColorsResource.notify();
  return { ok: true };
});

export const handleDeleteColor = implement(deleteCategoryColor, async ({ params }) => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  const category = decodeURIComponent(params.category ?? "");
  if (!category) throw new HttpError(400, "missing-category");
  await db
    .delete(_conversationCategoryColors)
    .where(eq(_conversationCategoryColors.category, category));
  categoryColorsResource.notify();
  return { ok: true };
});
