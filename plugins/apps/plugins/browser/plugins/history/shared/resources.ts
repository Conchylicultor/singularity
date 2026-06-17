import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// One row per distinct recently-visited URL, newest first. `visitedAt` is the
// most recent visit time; it serializes to ISO over the wire and `z.coerce.date`
// rebuilds a Date on the client (same precedent as the page editor's resources).
export const BrowserRecentSchema = z.object({
  url: z.string(),
  title: z.string(),
  visitedAt: z.coerce.date(),
});
export type BrowserRecent = z.infer<typeof BrowserRecentSchema>;

export const browserRecentsResource = resourceDescriptor<BrowserRecent[]>(
  "browser-recents",
  z.array(BrowserRecentSchema),
  [],
);
