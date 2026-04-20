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
  // Single-barrel schema discovery: drizzle-kit follows the export chains in
  // schema.ts to find all tables and views. Plugin tables/views are registered
  // there; adding a new plugin requires one line in that barrel.
  // (Previously a glob; switched to the barrel after tasks-core migration so
  // stub re-export files in tasks/ and conversations/ don't create duplicates.)
  schema: ["./src/db/schema.ts"],
  out: "./src/db/migrations",
  dbCredentials: {
    url: `postgres://${user}@${host}:${port}/${worktree}`,
  },
});
