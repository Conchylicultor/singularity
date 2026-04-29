// Zod schemas + types. Tables live in `./tables.ts`.
// Pure Zod schemas are defined in `../../shared/schemas.ts` so they can be
// consumed by shared/ and web/ without pulling drizzle into the bundle.

export {
  YakShavingNodeSchema,
  YakShavingCategorySchema,
} from "../../shared/schemas";
export type {
  YakShavingNode,
  YakShavingCategory,
} from "../../shared/schemas";
