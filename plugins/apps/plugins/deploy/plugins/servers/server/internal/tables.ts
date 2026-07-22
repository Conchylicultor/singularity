import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const _deployServers = pgTable("deploy_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(22),
  sshUser: text("ssh_user").notNull().default("root"),
  consoleUrl: text("console_url"),
  status: text("status").notNull().default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
