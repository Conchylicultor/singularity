import { useMemo } from "react";
import type { AvatarSpec } from "@plugins/fields/plugins/avatar/core";
import { useConfig } from "@plugins/config_v2/web";
import { conversationCategoryConfig } from "../../shared/config";

export type { AvatarSpec };

export function useCategoryAvatars(): Record<string, AvatarSpec> {
  const { categories } = useConfig(conversationCategoryConfig);
  return useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name, c.avatar])),
    [categories],
  );
}
