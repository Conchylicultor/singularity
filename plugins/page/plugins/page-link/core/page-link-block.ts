import { z } from "zod";
import { MdLink } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const pageLinkBlock = defineBlock({
  type: "page-link",
  schema: z.object({ pageId: z.string() }),
  label: "Link to page",
  icon: MdLink,
  empty: () => ({ pageId: "" }),
});
