import { z } from "zod";

/**
 * What the sweep found when it reclaimed a leaked test database.
 *
 * The point of carrying `prefix` and `pid` rather than just the name: the name
 * is gone the moment the database is dropped, so the report is the only place
 * the facts survive. `prefix` names the SUITE whose runs are dying, which is the
 * thing anyone acts on.
 */
export const LeakedTestDbPayloadSchema = z.object({
  /** The database that was dropped. */
  name: z.string(),
  /** The suite label it was minted with, e.g. `page_forest_test`. */
  prefix: z.string(),
  /** The pid of the test process that minted it and then died. */
  pid: z.number(),
  /** Epoch ms at mint, decoded from the name. */
  mintedAt: z.number(),
  /** How long it sat on the cluster before the sweep found it. */
  ageMs: z.number(),
  /** Bytes reclaimed, as measured immediately before the drop. */
  bytes: z.number(),
});

export type LeakedTestDbPayload = z.infer<typeof LeakedTestDbPayloadSchema>;
