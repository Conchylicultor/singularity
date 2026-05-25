import { z } from "zod";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const textBlock = defineBlock({
  type: "text",
  schema: z.object({ text: z.string() }),
});
