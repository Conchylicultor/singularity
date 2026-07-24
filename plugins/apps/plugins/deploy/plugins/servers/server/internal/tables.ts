import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const _deployServers = pgTable("deploy_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(22),
  sshUser: text("ssh_user").notNull().default("root"),
  consoleUrl: text("console_url"),
  // Public half of the keypair whose private half lives in the secrets store.
  // Non-null whenever we hold a usable key — generated here, or derived from a
  // private key the user pasted. Null means we cannot name a key for this
  // server, which is the only honest way to say "no key".
  sshPublicKey: text("ssh_public_key"),
  // No `status` column: reachability is probe-written state owned by the
  // `health` sub-plugin's `deploy_servers_ext_health` side-table, not registry
  // data. See `../../shared/schemas.ts`.
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
