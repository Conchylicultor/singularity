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
  // Glob across every plugin's internal schema. Each plugin owns its tables
  // under `plugins/<name>/server/internal/tables.ts` and (for plugins with
  // derived views) `plugins/<name>/server/internal/schema.ts`. Cross-plugin
  // access goes through that plugin's `server/api.ts`. Adding a new plugin
  // schema requires no change here.
  schema: [
    "../plugins/*/server/internal/tables.ts",
    "../plugins/*/server/internal/schema.ts",
    "../plugins/*/plugins/*/server/internal/tables.ts",
    "../plugins/*/plugins/*/server/internal/schema.ts",
  ],
  out: "./src/db/migrations",
  dbCredentials: {
    url: `postgres://${user}@${host}:${port}/${worktree}`,
  },
});
