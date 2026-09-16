import { MdDescription } from "react-icons/md";
import { plainOf } from "@plugins/page/plugins/editor/core";
import type { InsertAction } from "@plugins/page/plugins/editor/web";
import { textBlock } from "@plugins/page/plugins/text/core";
import { turnBlockIntoPage } from "./turn-block-into-page";

/**
 * `/page`: a new sub-page made in place of the caret's line, listed right after
 * Text as in Notion. The line's other words become its title (trimmed — the cut
 * leaves the space that stood before the `/`), so nothing the user typed
 * disappears; an otherwise-empty line gives an untitled page.
 *
 * An insert action rather than a menu `label` on the `page` block type: minting
 * a page means minting its `page_id` partition, which only the server's
 * turn-into-page op can do — a plain block-type conversion cannot.
 */
export const pageInsertAction: InsertAction = {
  id: "page",
  label: "Page",
  icon: MdDescription,
  aliases: ["sub-page", "subpage", "new page"],
  after: textBlock.type,
  run: ({ blockId, text }) => {
    void turnBlockIntoPage(blockId, plainOf(text).trim());
  },
};
