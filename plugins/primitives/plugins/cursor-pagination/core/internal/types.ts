import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";

export interface CursorPage<T> {
  items: T[];
  hasMore: boolean;
}

export function cursorPageSchema<T>(itemSchema: ZodParser<T>) {
  return z.object({
    items: z.array(itemSchema),
    hasMore: z.boolean(),
  });
}
