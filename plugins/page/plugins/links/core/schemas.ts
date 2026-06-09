import { z } from "zod";
import { SvgNodeSchema } from "@plugins/page/plugins/editor/core";

// One referencing (source) page in a target page's backlinks list. Carries
// just enough to render a clickable row: the source page's id, title, and the
// page icon's SVG tree (null when the page has no icon).
export const BacklinkRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  iconSvgNodes: z.array(SvgNodeSchema).nullable(),
});
export type BacklinkRow = z.infer<typeof BacklinkRowSchema>;
