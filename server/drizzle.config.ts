import { defineConfig } from "drizzle-kit";

const worktree = process.env.SINGULARITY_WORKTREE;
if (!worktree) {
  throw new Error("SINGULARITY_WORKTREE env var is required");
}
const host = process.env.PGHOST ?? "localhost";
const port = process.env.PGPORT ?? "5432";
const user = process.env.PGUSER ?? process.env.USER ?? "postgres";

export default defineConfig({
  dialect: "postgresql",
  // Glob discovery: drizzle-kit picks up every plugin's schema files directly.
  // These files are pure drizzle-orm definitions with no Bun imports in their
  // transitive closure, so drizzle-kit's loader can process them — whereas
  // going through plugin index.ts files would pull in handlers that import
  // `bun`, `bun-pty`, etc. and fail to resolve.
  schema: [
    "../plugins/**/server/**/internal/tables.ts",
    "../plugins/**/server/**/internal/tables-*.ts",
    "../plugins/**/server/**/internal/schema.ts",
    "../plugins/**/server/**/internal/schema-*.ts",
  ],
  out: "./src/db/migrations",
  dbCredentials: {
    url: `postgres://${user}@${host}:${port}/${worktree}`,
  },
});
