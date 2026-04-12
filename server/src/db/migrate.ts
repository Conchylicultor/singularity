import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./client";

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: `${import.meta.dir}/migrations` });
}

if (import.meta.main) {
  await runMigrations();
  console.log("Migrations applied");
  process.exit(0);
}
