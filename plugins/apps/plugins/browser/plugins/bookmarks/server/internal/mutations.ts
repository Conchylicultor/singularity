import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _browserBookmarks } from "./tables";

export async function addBookmark(url: string, title: string): Promise<void> {
  await db
    .insert(_browserBookmarks)
    .values({ id: crypto.randomUUID(), url, title });
}

export async function deleteBookmark(id: string): Promise<void> {
  await db.delete(_browserBookmarks).where(eq(_browserBookmarks.id, id));
}
