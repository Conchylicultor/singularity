import { z, type ZodType } from "zod";
import type { FilterGroup, FilterNode, FilterRule } from "./types";

/**
 * Zod mirror of the `FilterRule` / `FilterGroup` / `FilterNode` interfaces, for
 * validating a `FilterGroup` arriving over the wire (the server-delegated
 * `dataSource` path posts the user-authored filter tree in a request body). The
 * recursion is closed with `z.lazy` so the group's `children` can nest groups.
 *
 * `value` is `unknown` (operands are JSON-safe but otherwise opaque — a rule's
 * operand shape is owned by its field-type operator, not this schema).
 */
export const FilterRuleSchema: ZodType<FilterRule> = z.object({
  kind: z.literal("rule"),
  id: z.string(),
  fieldId: z.string(),
  operatorId: z.string(),
  value: z.unknown().optional(),
});

export const FilterNodeSchema: ZodType<FilterNode> = z.lazy(() =>
  z.union([FilterRuleSchema, FilterGroupSchema]),
);

export const FilterGroupSchema: ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    kind: z.literal("group"),
    id: z.string(),
    conjunction: z.union([z.literal("and"), z.literal("or")]),
    children: z.array(FilterNodeSchema),
  }),
);
