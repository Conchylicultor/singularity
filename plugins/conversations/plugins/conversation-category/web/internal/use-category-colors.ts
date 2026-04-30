import { z } from "zod";
import { resourceDescriptor, useResource } from "@plugins/primitives/plugins/live-state/web";

const categoryColorsResource = resourceDescriptor<Record<string, string>>(
  "conversation-category-colors",
  z.record(z.string()),
);

export function useCategoryColors(): Record<string, string> {
  const { data } = useResource(categoryColorsResource);
  return data ?? {};
}
