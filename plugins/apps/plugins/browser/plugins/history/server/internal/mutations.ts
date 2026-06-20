import { db } from "@plugins/database/server";
import { browserHistory } from "./tables";

// Best-effort hostname for the visit title; falls back to the raw url if it
// can't be parsed as a URL. `URL.parse` returns null instead of throwing, so no
// error swallowing is involved.
function titleFor(url: string): string {
  return URL.parse(url)?.hostname ?? url;
}

export async function recordVisit(url: string): Promise<void> {
  await db.insert(browserHistory).values({
    id: crypto.randomUUID(),
    url,
    title: titleFor(url),
  });
}
