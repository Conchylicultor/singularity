import { defineConfig } from "drizzle-kit";
import {
  readDatabaseConfig,
  buildConnectionString,
} from "@plugins/database/core";

const worktree = process.env.SINGULARITY_WORKTREE;
if (!worktree) {
  throw new Error("SINGULARITY_WORKTREE env var is required");
}

const config = readDatabaseConfig();
const conn = {
  host: process.env.PGHOST ?? config.connection.host,
  port: Number(process.env.PGPORT ?? config.connection.port),
  user: process.env.PGUSER ?? config.connection.user,
};

export default defineConfig({
  dialect: "postgresql",
  // Glob discovery: drizzle-kit picks up every plugin's tables.ts / schema.ts
  // directly, not through plugin index.ts files (which would pull in handlers,
  // routes, and other server init code that shouldn't run during codegen).
  schema: [
    "../../../../plugins/**/server/**/internal/tables.ts",
    "../../../../plugins/**/server/**/internal/tables-*.ts",
    "../../../../plugins/**/server/**/internal/schema.ts",
    "../../../../plugins/**/server/**/internal/schema-*.ts",
  ],
  out: "./data",
  dbCredentials: { url: buildConnectionString(conn, worktree) },
});
