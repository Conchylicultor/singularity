import { z } from "zod";
import { MdLink } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const pageLinkBlock = defineBlock({
  type: "page-link",
  schema: z.object({ pageId: z.string() }),
  label: "Link to page",
  icon: MdLink,
  aliases: ["link", "reference", "subpage"],
  empty: () => ({ pageId: "" }),
  // An icon+title Row (not doc text), wrapped in `py-xs`: seat the rail on the
  // Row's center — its own `pad-row-y` top plus half a `text-body` line.
  gutterFirstLineCenter: "calc(var(--space-xs) + var(--pad-row-y) + var(--line-height-body) / 2)",
  // Always show the collapse chevron: a collapsed link mounts no children, so
  // `hasChildren` is false and without this no chevron would ever appear.
  collapsible: "always",
});
