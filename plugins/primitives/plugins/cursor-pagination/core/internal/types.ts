import { z, type ZodType } from "zod";

export interface CursorPage<T> {
  items: T[];
  hasMore: boolean;
}

export function cursorPageSchema<T>(itemSchema: ZodType<T>) {
  return z.object({
    items: z.array(itemSchema),
    hasMore: z.boolean(),
  });
}
