import { z } from "zod";
import {
  pickMeta,
  type FieldDef,
  type FieldMeta,
} from "@plugins/config_v2/core";
import {
  reorderTreeFieldType,
  type ReorderNode,
  type ReorderTree,
} from "@plugins/fields/plugins/reorder-tree/core";

const nodeSchema: z.ZodType<ReorderNode> = z.lazy(() =>
  z.union([
    z.string(),
    z.object({ item: z.string(), hidden: z.boolean().optional() }),
    z.object({ spacer: z.string() }),
    z.object({ group: z.string(), items: z.array(nodeSchema) }),
  ]),
);

export interface ReorderTreeFieldDef extends FieldDef<ReorderTree> {
  readonly type: typeof reorderTreeFieldType;
}

export function reorderTreeField(
  opts?: FieldMeta & { default?: ReorderTree },
): ReorderTreeFieldDef {
  return Object.freeze({
    type: reorderTreeFieldType,
    schema: z.array(nodeSchema),
    defaultValue: opts?.default ?? [],
    meta: pickMeta(opts),
  });
}

/**
 * Discriminated, normalized view of a {@link ReorderNode}. Coerces the terse
 * bare-string form to `{ kind: "item", item, hidden: false }`.
 */
export type NormalizedNode =
  | { kind: "item"; item: string; hidden: boolean }
  | { kind: "spacer"; spacer: string }
  | { kind: "group"; group: string; items: ReorderNode[] };

export function normalizeNode(node: ReorderNode): NormalizedNode {
  if (typeof node === "string") {
    return { kind: "item", item: node, hidden: false };
  }
  if ("item" in node) {
    return { kind: "item", item: node.item, hidden: node.hidden ?? false };
  }
  if ("spacer" in node) {
    return { kind: "spacer", spacer: node.spacer };
  }
  return { kind: "group", group: node.group, items: node.items };
}
