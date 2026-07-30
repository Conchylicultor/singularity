import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { _deployServers } from "@plugins/apps/plugins/deploy/plugins/servers/server";
// The specific module, not the `core` barrel: drizzle-kit loads this file to
// build the schema, and `core/derive.ts` is plain strings with no imports at all.
import { DEFAULT_LOOPBACK_PORT } from "../../core/derive";

// Where a composition is served and under what URL: `(composition × server) →
// { hostnames, loopbackPort }`. Runtime data, deliberately not repo state — the
// same composition can be served on many surfaces, and a URL is a deploy/server
// concern rather than a property of the software. See `../../core/schemas.ts`
// for what is absent and why (the run user, dir layout, unit and platform are
// all derived, never columns).
export const _deployDeployments = pgTable(
  "deploy_deployments",
  {
    id: text("id").primaryKey(),
    // A composition NAME from the `compositions` config. No FK to point at —
    // compositions are config_v2 data, not rows — so the create handler
    // validates membership at write time.
    compositionId: text("composition_id").notNull(),
    serverId: text("server_id")
      .notNull()
      .references(() => _deployServers.id, { onDelete: "cascade" }),
    // Public hostnames Caddy serves this deployment on. Empty is legal: an
    // install can exist before DNS does. `exposure` is derived from this array
    // being non-empty, never declared — a deployment behind an open 443 with a
    // public hostname simply IS public, so there is no flag to typo.
    hostnames: text("hostnames").array().notNull(),
    loopbackPort: integer("loopback_port").notNull().default(DEFAULT_LOOPBACK_PORT),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // The two invariants are carried by the DB, so neither needs a check and
    // neither can be lost to a concurrent write.
    //
    // One install of a composition per server. This is what buys the
    // single-name property: with no second deployment to disambiguate, the
    // composition name alone can name the install dir, the systemd instance,
    // the runtime namespace and the database. Staging and prod of one
    // composition therefore live on different servers, which is the normal
    // arrangement anyway; a `slot` discriminator is the documented way to lift
    // this if a real need appears.
    uniqueIndex("deploy_deployments_composition_server_uq").on(
      t.compositionId,
      t.serverId,
    ),
    // The port is the only resource two installs on one box contend for.
    uniqueIndex("deploy_deployments_server_port_uq").on(t.serverId, t.loopbackPort),
  ],
);
