import { useMemo } from "react";
import type { AvatarSpec } from "@plugins/fields/plugins/avatar/core";
import { useConfig } from "@plugins/config_v2/web";
import { conversationCategoryConfig } from "../../shared/config";

export type { AvatarSpec };

export interface CategoryItem {
  id: string;
  name: string;
  hint: string;
  avatar: AvatarSpec;
}

export interface Category {
  id: string;
  name: string;
  hint: string;
  items: CategoryItem[];
}

/** Every configured category, in config order. */
export function useCategories(): Category[] {
  const { categories } = useConfig(conversationCategoryConfig);
  return useMemo(
    () =>
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        hint: c.hint,
        items: c.items.map((i) => ({
          id: i.id,
          name: i.name,
          hint: i.hint,
          avatar: i.avatar,
        })),
      })),
    [categories],
  );
}

/**
 * The category chosen to paint sidebar avatars, or `null` when none is chosen or
 * the choice points at a category that no longer exists. `null` is determinate
 * — it means "no avatar category", and the row falls back to its title glyph.
 */
export function useAvatarCategoryId(): string | null {
  const { avatarCategory } = useConfig(conversationCategoryConfig);
  const categories = useCategories();
  if (!avatarCategory) return null;
  return categories.some((c) => c.id === avatarCategory) ? avatarCategory : null;
}

/** One category's item avatars, keyed by item name (the value rows store). */
export function useCategoryAvatars(
  categoryId: string | null,
): Record<string, AvatarSpec> {
  const categories = useCategories();
  return useMemo(() => {
    const category = categories.find((c) => c.id === categoryId);
    return Object.fromEntries(
      (category?.items ?? []).map((i) => [i.name, i.avatar]),
    );
  }, [categories, categoryId]);
}
