import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

// Building a backend database connection: every pool and standalone client
// carries a deadline on connect and on every query.
export {
  createDbPool,
  createDbClient,
  onClientLost,
  queryText,
  type DbClient,
  type CreateDbPoolOptions,
  type CreateDbClientOptions,
} from "./internal/client";
// The deadline itself: the bound, its scope, the error, and the seam a missed
// deadline is announced on.
export {
  QUERY_DEADLINE_MS,
  BOOT_DDL_QUERY_DEADLINE_MS,
  QueryDeadlineExceededError,
  queryDeadlineSink,
  withQueryDeadline,
  currentQueryDeadline,
  formatDeadlineLogLine,
  type QueryDeadlineEvent,
} from "./internal/deadline";
// Abandoning a lost connection (detach, hold, never close).
export {
  ABANDON_HOLD_CAP,
  AbandonedClientHold,
  abandonClient,
  assertPgPoolInternals,
} from "./internal/abandon";
// Test support: a proxy in front of the cluster whose forwarding can be switched
// off, so a suite can make any connection's calls go unanswered.
export {
  startBlackHoleProxy,
  type BlackHoleProxy,
} from "./internal/black-hole-proxy";

export default {
  description:
    "Every backend database connection, built one way: createDbPool / createDbClient give each pool or standalone client a name from the closed pool-name set and a pg.Client subclass that bounds connect() and every query() with a deadline (60 s, widened per scope by withQueryDeadline). A call with no reply rejects with QueryDeadlineExceededError (pool, phase, sql, origin), and its connection is abandoned — detached, held, never closed, since its fd may already be someone else's — and announced on queryDeadlineSink.",
} satisfies ServerPluginDefinition;
