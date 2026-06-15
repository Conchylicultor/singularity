import { z } from "zod";
import { MdSmartDisplay } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const EMBED_TYPE = "embed";

export const embedBlock = defineBlock({
  type: EMBED_TYPE,
  schema: z.object({ url: z.string().optional() }),
  label: "Embed",
  icon: MdSmartDisplay,
  aliases: ["iframe", "youtube", "vimeo", "video url", "tweet"],
  empty: () => ({}),
});
