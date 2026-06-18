import { boolean, type PgColumnBuilderBase } from "drizzle-orm/pg-core";

export const build = (name: string): PgColumnBuilderBase => boolean(name);
