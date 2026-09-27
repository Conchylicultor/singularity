import { z } from "zod";
import { defineBlock } from "@plugins/page/plugins/editor/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const smartDisplayIcon = symbol("smart-display");

export const EMBED_TYPE = "embed";

export const embedBlock = defineBlock({
  type: EMBED_TYPE,
  schema: z.object({ url: z.string().optional() }),
  label: "Embed",
  icon: smartDisplayIcon,
  aliases: ["iframe", "youtube", "vimeo", "video url", "tweet"],
  empty: () => ({}),
});
