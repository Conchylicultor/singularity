import { boolean, text, timestamp } from "drizzle-orm/pg-core";
import { _deployServers } from "@plugins/apps/plugins/deploy/plugins/servers/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// Per-server reachability: the last SSH probe's verdict. An entity extension
// rather than a column on `deploy_servers` because this is probe-written state
// with its own writer and lifecycle — the registry holds identity, this holds
// liveness. FK CASCADE on server delete comes free.
export const serverHealth = defineExtension(_deployServers, "health", {
  ok: boolean("ok").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  // Null when `ok`; one of the `SshFailureKind` values otherwise.
  failureKind: text("failure_kind"),
  failureMessage: text("failure_message"),
  /** `deploy_servers.ssh_public_key` AS OF the check — see `shared/schemas.ts`. */
  checkedPublicKey: text("checked_public_key"),
  /**
   * TOFU-pinned known_hosts line, learned on the first successful check and
   * required to match on every later one. Never leaves the server: the wire row
   * (`ServerHealthRowSchema`) deliberately omits it.
   */
  hostKeyLine: text("host_key_line"),
});
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _deployServersHealthExt = serverHealth.table;
