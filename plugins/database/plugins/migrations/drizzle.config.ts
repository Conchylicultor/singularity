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
  // Glob discovery: drizzle-kit picks up every plugin's schema files directly.
  // These files are pure drizzle-orm definitions with no Bun imports in their
  // transitive closure, so drizzle-kit's loader can process them — whereas
  // going through plugin index.ts files would pull in handlers that import
  // `bun`, `bun-pty`, etc. and fail to resolve.
  schema: [
    "../../../../plugins/**/server/**/internal/tables.ts",
    "../../../../plugins/**/server/**/internal/tables-*.ts",
    "../../../../plugins/**/server/**/internal/schema.ts",
    "../../../../plugins/**/server/**/internal/schema-*.ts",
  ],
  out: "./data",
  dbCredentials: { url: buildConnectionString(conn, worktree) },
});
