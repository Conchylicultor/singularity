import { z } from "zod";
import type { ReorderNodeType } from "@plugins/reorder/plugins/node-types/core";
import { HeaderBox } from "../components/header-box";

const headerSchema = z.object({
  label: z.string().optional(),
  collapsed: z.boolean().optional(),
});

export const headerNodeType: ReorderNodeType<z.infer<typeof headerSchema>> = {
  type: "header",
  container: true,
  schema: headerSchema,
  render: (p) => (
    <HeaderBox payload={p.payload} editMode={p.editMode} onPatch={p.onPatch}>
      {p.children}
    </HeaderBox>
  ),
  // No `insert` — container creation is config-only this pass.
};
