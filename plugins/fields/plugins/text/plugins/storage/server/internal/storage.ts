import { text, type PgColumnBuilderBase } from "drizzle-orm/pg-core";

export const build = (name: string): PgColumnBuilderBase => text(name);
