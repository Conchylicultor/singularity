import { z } from "zod";

// One referencing (source) page in a target page's backlinks list. Carries
// just enough to render a clickable row: the source page's id, title, and
// optional icon.
export const BacklinkRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
});
export type BacklinkRow = z.infer<typeof BacklinkRowSchema>;
