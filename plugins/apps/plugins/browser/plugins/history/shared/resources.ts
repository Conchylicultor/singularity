import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";

// One row per distinct recently-visited URL, newest first. `visitedAt` is the
// most recent visit time; it serializes to ISO over the wire and `z.coerce.date`
// rebuilds a Date on the client (same precedent as the page editor's resources).
export const BrowserRecentSchema = z.object({
  url: z.string(),
  title: z.string(),
  visitedAt: z.coerce.date(),
});
export type BrowserRecent = z.infer<typeof BrowserRecentSchema>;

// The start page's "Recent" list, as ONE value rather than a collection: it is
// a derivation (the latest visit per distinct url, then the newest 12 of
// those), not rows of one table, so there is no row set to window. The server
// caps it with the loader's LIMIT and states that bound (`unbounded: { reason
// }`). No placeholder: before the first value lands the read is `pending`.
export const browserRecents = liveValue("browser-recents", {
  schema: z.array(BrowserRecentSchema),
});
