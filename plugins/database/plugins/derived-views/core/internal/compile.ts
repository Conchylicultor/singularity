import { getViewConfig, PgDialect } from "drizzle-orm/pg-core";
import type { RegisteredView } from "./registry";

const dialect = new PgDialect();

// Compiles a registered plain view into its `CREATE VIEW` DDL. The SELECT body
// is rendered from the drizzle view object with `inlineParams()` so every
// literal is inlined and the result has zero bind parameters — a standalone,
// executable statement. References to other views appear inline as their quoted
// names (e.g. tasks_v's body contains "attempts_v"), which is why the rebuild
// must create dependencies first (see topoSortViews).
export function compileCreateView(view: RegisteredView): string {
  const cfg = getViewConfig(view.view);
  const body = dialect.sqlToQuery(cfg.query!.inlineParams()).sql;
  return `CREATE VIEW "public"."${cfg.name}" AS ${body}`;
}
