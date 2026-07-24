import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const _deployServers = pgTable("deploy_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(22),
  sshUser: text("ssh_user").notNull().default("root"),
  consoleUrl: text("console_url"),
  // Public half of a server-generated keypair (the private half lives in the
  // secrets store). Null when no key was generated (e.g. a manually pasted key).
  sshPublicKey: text("ssh_public_key"),
  // No `status` column: reachability is probe-written state owned by the
  // `health` sub-plugin's `deploy_servers_ext_health` side-table, not registry
  // data. See `../../shared/schemas.ts`.
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
