import { and, lt, not, or, sql } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { db } from "@plugins/database/server";
import { _attachments } from "./tables";
import { getRegisteredLinks } from "./define-link";

const TTL_MS = 60 * 60 * 1000; // 1 hour
const INTERVAL_MS = 60 * 60 * 1000;

let started = false;

export function startOrphanSweep(): void {
  if (started) return;
  started = true;
  void runSweep();
  setInterval(runSweep, INTERVAL_MS);
}

async function runSweep(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - TTL_MS);
    const links = getRegisteredLinks();
    // An attachment is "referenced" if any registered link table has a row
    // pointing at its id. Build NOT (EXISTS … OR EXISTS …) across all
    // registered sources. Single statement → Postgres snapshot keeps us from
    // racing a just-inserted link.
    const unreferenced =
      links.length === 0
        ? sql`true`
        : not(
            or(
              ...links.map(
                (l) =>
                  sql`exists (select 1 from ${l.table} where ${l.attachmentIdCol} = ${_attachments.id})`,
              ),
            )!,
          );
    const rows = await db
      .delete(_attachments)
      .where(and(lt(_attachments.createdAt, cutoff), unreferenced))
      .returning({ diskPath: _attachments.diskPath });
    await Promise.all(rows.map((r) => unlink(r.diskPath).catch(() => undefined)));
    if (rows.length > 0) {
      // biome-ignore lint/suspicious/noConsole: boot-time sweep visibility.
      console.log(`[attachments] orphan sweep removed ${rows.length} files`);
    }
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: surface failures but keep the timer alive.
    console.warn("[attachments] orphan sweep failed:", err);
  }
}
