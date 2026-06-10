import { z } from "zod";
import { SpacerReorderItem } from "@plugins/reorder/plugins/editor/web";
import type { ReorderNodeType } from "@plugins/reorder/plugins/node-types/core";

export const spacerNodeType: ReorderNodeType<Record<string, never>> = {
  type: "spacer",
  container: false,
  schema: z.object({}),
  render: (p) => <SpacerReorderItem itemKey={p.id!} editMode={p.editMode} />,
  insert: {
    label: "Add Spacer",
    create: () => ({ type: "spacer", id: crypto.randomUUID() }),
  },
};
