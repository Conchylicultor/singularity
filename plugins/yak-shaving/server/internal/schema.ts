import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { _yakShavingCategories, _yakShavingNodes } from "./tables";

// Zod schemas + types. Tables live in `./tables.ts`.

export const YakShavingNodeSchema = createSelectSchema(_yakShavingNodes, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type YakShavingNode = z.infer<typeof YakShavingNodeSchema>;

export const YakShavingCategorySchema = createSelectSchema(_yakShavingCategories, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type YakShavingCategory = z.infer<typeof YakShavingCategorySchema>;
