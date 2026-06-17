import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { BrowserRecentSchema, type BrowserRecent } from "../../shared/resources";
import { browserHistory } from "./tables";

const RECENTS_LIMIT = 12;

// Most-recent visit per distinct URL, newest first, capped at RECENTS_LIMIT.
// `DISTINCT ON (url)` keeps the latest row per url (the inner order picks it);
// the outer query then sorts those by recency.
export const browserRecentsServerResource = defineResource({
  key: "browser-recents",
  mode: "push",
  schema: z.array(BrowserRecentSchema),
  loader: async (): Promise<BrowserRecent[]> => {
    const latest = db
      .selectDistinctOn([browserHistory.url], {
        url: browserHistory.url,
        title: browserHistory.title,
        visitedAt: browserHistory.visitedAt,
      })
      .from(browserHistory)
      .orderBy(browserHistory.url, sql`${browserHistory.visitedAt} desc`)
      .as("latest");

    const rows = await db
      .select({
        url: latest.url,
        title: latest.title,
        visitedAt: latest.visitedAt,
      })
      .from(latest)
      .orderBy(sql`${latest.visitedAt} desc`)
      .limit(RECENTS_LIMIT);

    return rows;
  },
});
