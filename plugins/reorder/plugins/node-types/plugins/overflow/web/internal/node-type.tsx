import { z } from "zod";
import type { ReorderNodeType } from "@plugins/reorder/plugins/node-types/core";
import { OverflowBox } from "../components/overflow-box";

const overflowSchema = z.object({
  label: z.string().optional(),
});

export const overflowNodeType: ReorderNodeType<z.infer<typeof overflowSchema>> = {
  type: "overflow",
  container: true,
  schema: overflowSchema,
  render: (p) => (
    <OverflowBox payload={p.payload} editMode={p.editMode}>
      {p.children}
    </OverflowBox>
  ),
  // No `insert` — container creation is config-only, exactly like `header`.
};
