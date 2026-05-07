import { db } from "@plugins/database/server";
import { config } from "./tables";

// In-memory cache of all config values, keyed by fullKey. Populated on first
// read and kept in sync with PATCH writes. Server handlers call this from the
// hot path (e.g. every commits-stats request) — the underlying `defineResource`
// machinery re-runs the loader on every load(), so we can't rely on it for
// per-request reads.

let cache: Map<string, unknown> | null = null;

async function load(): Promise<Map<string, unknown>> {
  const rows = await db.select().from(config);
  const m = new Map<string, unknown>();
  for (const r of rows) m.set(r.key, r.value);
  return m;
}

export async function getAll(): Promise<Map<string, unknown>> {
  if (cache) return cache;
  cache = await load();
  return cache;
}

export async function getValue(fullKey: string): Promise<unknown | undefined> {
  const m = await getAll();
  return m.get(fullKey);
}

export function setValue(fullKey: string, value: unknown): void {
  if (!cache) return;
  cache.set(fullKey, value);
}

export function deleteValue(fullKey: string): void {
  if (!cache) return;
  cache.delete(fullKey);
}

/** Called after a successful write path if we want to force a reload. */
export function invalidate(): void {
  cache = null;
}
