import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { HALF_LIFE_MS, recordUsageEndpoint, usageKey } from "../../core";
import { _usageStats } from "./tables";

export const handleRecordUsage = implement(
  recordUsageEndpoint,
  async ({ body }) => {
    const key = usageKey(body.namespace, body.key);
    // ONE atomic upsert — the whole frecency update, no read-modify-write race
    // between concurrent uses (the playback-history increment precedent, with
    // the decay folded into the same statement).
    //
    // On conflict, `_usageStats.<col>` renders as the qualified existing-row
    // column, so this reads the PREVIOUS score/last_used_at and writes
    // `previous * 0.5^(Δt/HALF_LIFE) + 1` — decay to now, then count this use.
    // Both operands are cast to double precision so the arithmetic stays float8
    // (extract(epoch …) is numeric) and never silently re-types the column.
    await db
      .insert(_usageStats)
      .values({
        usageKey: key,
        namespace: body.namespace,
        score: 1,
        useCount: 1,
        lastUsedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: _usageStats.usageKey,
        set: {
          score: sql`${_usageStats.score} * pow(
            0.5::double precision,
            (extract(epoch from (now() - ${_usageStats.lastUsedAt})) * 1000.0 / ${HALF_LIFE_MS})::double precision
          ) + 1`,
          useCount: sql`${_usageStats.useCount} + 1`,
          lastUsedAt: sql`now()`,
        },
      });
  },
);
