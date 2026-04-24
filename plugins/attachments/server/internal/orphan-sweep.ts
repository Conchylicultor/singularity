import { and, isNull, lt } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { db } from "../../../../server/src/db/client";
import { _attachments } from "./tables";

const TTL_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 60 * 60 * 1000; // hourly

let started = false;

export function startOrphanSweep(): void {
  if (started) return;
  started = true;
  // Run once on boot, then hourly.
  void runSweep();
  setInterval(runSweep, INTERVAL_MS);
}

async function runSweep(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - TTL_MS);
    const rows = await db
      .delete(_attachments)
      .where(and(isNull(_attachments.ownerId), lt(_attachments.createdAt, cutoff)))
      .returning({ diskPath: _attachments.diskPath });
    await Promise.all(rows.map((r) => unlink(r.diskPath).catch(() => undefined)));
    if (rows.length > 0) {
      // biome-ignore lint/suspicious/noConsole: boot-time sweep visibility.
      console.log(`[attachments] orphan sweep removed ${rows.length} staged files`);
    }
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: surface failures but keep the timer alive.
    console.warn("[attachments] orphan sweep failed:", err);
  }
}
