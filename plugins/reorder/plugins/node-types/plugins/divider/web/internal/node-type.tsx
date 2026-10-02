import { z } from "zod";
import { DividerReorderItem } from "@plugins/reorder/plugins/editor/web";
import type { ReorderNodeType } from "@plugins/reorder/plugins/node-types/core";

export const dividerNodeType: ReorderNodeType<Record<string, never>> = {
  type: "divider",
  container: false,
  schema: z.object({}),
  render: (p) => <DividerReorderItem itemKey={p.id!} editMode={p.editMode} />,
  insert: {
    label: "Add Divider",
    create: () => ({ type: "divider", id: crypto.randomUUID() }),
  },
};
