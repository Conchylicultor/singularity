import { timestamp, type PgColumnBuilderBase } from "drizzle-orm/pg-core";

export const build = (name: string): PgColumnBuilderBase =>
  timestamp(name, { withTimezone: true });
