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
  /**
   * The host's own `uname -sm`, parsed to a `PlatformTag` — which artifact this
   * server will accept. DISCOVERED, never typed by a human: a reinstalled or
   * resized box reports its own truth on the next check, so moving from x86 to
   * ARM is not a code change. It lives here rather than on `deploy_servers` for
   * the same reason `ok` does — probe-written state with its own writer and
   * lifecycle — and it is the twin of `checkedPublicKey`: stamped AS OF this
   * check.
   *
   * Null is NOT merely "unknown". Read with `ok`, the pair spells out four
   * distinct states, so no failure is absorbed into the null (see
   * `shared/schemas.ts` for the table).
   *
   * Appended rather than grouped beside `checkedPublicKey` on purpose: key order
   * in this object is what drizzle-kit diffs positionally (see the note in
   * `define-extension.ts`), so a new column goes on the end and no existing one
   * shifts.
   */
  platform: text("platform"),
});
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _deployServersHealthExt = serverHealth.table;
