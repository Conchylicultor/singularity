import { getConfig } from "@plugins/config_v2/server";
import { conversationCategoryConfig } from "../../shared/config";

/** One configured category, flattened to what callers outside this plugin need. */
export interface CategoryDescriptor {
  id: string;
  name: string;
  hint: string;
  items: { name: string; hint: string }[];
}

export function getCategories(): CategoryDescriptor[] {
  const { categories } = getConfig(conversationCategoryConfig);
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    hint: c.hint,
    items: c.items.map((i) => ({ name: i.name, hint: i.hint })),
  }));
}

export function findCategory(categoryId: string): CategoryDescriptor | undefined {
  return getCategories().find((c) => c.id === categoryId);
}

/**
 * The configured item names of one category, in config order — the series order
 * a chart should render. Empty for an unknown category id, which is a legitimate
 * answer (the category was deleted from config), not a failure.
 */
export function getItemOrder(categoryId: string): string[] {
  return findCategory(categoryId)?.items.map((i) => i.name) ?? [];
}

/**
 * The category chosen to paint sidebar avatars, or null when none is chosen or
 * the choice points at a category that no longer exists.
 */
export function getAvatarCategoryId(): string | null {
  const { avatarCategory } = getConfig(conversationCategoryConfig);
  if (!avatarCategory) return null;
  return findCategory(avatarCategory) ? avatarCategory : null;
}
