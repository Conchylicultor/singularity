import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import { z } from "zod";
import { _conversationCategoryColors } from "./tables-colors";

export const CategoryAvatarOverrideSchema = z.object({
  colorKey: z.string().nullable(),
  iconKey: z.string().nullable(),
  iconSvgNodes: z.string().nullable(),
});

export type CategoryAvatarOverride = z.infer<typeof CategoryAvatarOverrideSchema>;

export const categoryColorsResource = defineResource<Record<string, CategoryAvatarOverride>>({
  key: "conversation-category-colors",
  mode: "push",
  schema: z.record(CategoryAvatarOverrideSchema),
  loader: async () => {
    const rows = await db.select().from(_conversationCategoryColors);
    return Object.fromEntries(
      rows.map((r) => [r.category, {
        colorKey: r.colorKey ?? null,
        iconKey: r.iconKey ?? null,
        iconSvgNodes: r.iconSvgNodes ?? null,
      }]),
    );
  },
});
