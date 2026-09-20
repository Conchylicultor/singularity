import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * A tick that moves each time the server writes a minute of the ledger. The Stats
 * card keeps it OUT of its query key and refetches its summary in place when it
 * moves (the `runs.revision` precedent): the rows themselves are a growing
 * collection with no bounded reader, a number is bounded by construction.
 */
export const latencyLedgerRevisionResource = resourceDescriptor<{
  rev: number;
}>("latency-ledger.revision", z.object({ rev: z.number() }), { rev: 0 });
