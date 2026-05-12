import { z } from "zod";
import { resourceDescriptor, useResource } from "@plugins/primitives/plugins/live-state/web";

const CategoryAvatarOverrideSchema = z.object({
  colorKey: z.string().nullable(),
  iconKey: z.string().nullable(),
});

export type CategoryAvatarOverride = z.infer<typeof CategoryAvatarOverrideSchema>;

const categoryColorsResource = resourceDescriptor<Record<string, CategoryAvatarOverride>>(
  "conversation-category-colors",
  z.record(CategoryAvatarOverrideSchema),
  {},
);

export function useCategoryColors(): Record<string, CategoryAvatarOverride> {
  const { data } = useResource(categoryColorsResource);
  return data;
}
