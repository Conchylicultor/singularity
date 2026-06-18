import { doublePrecision, type PgColumnBuilderBase } from "drizzle-orm/pg-core";

export const build = (name: string): PgColumnBuilderBase => doublePrecision(name);
