import type { PgView } from "drizzle-orm/pg-core";

// A registered derived (plain, non-materialized) view. Plain views hold no data
// — they're deterministic code rebuilt from source on every boot. `dependsOn`
// lists the SQL names of OTHER registered views this view reads from, so the
// rebuild can drop/create them in dependency order.
//
// Views are declared via the `View` server contribution (derived-views/server),
// collected by the framework at boot — never via a module-level registry, so
// registration can't silently depend on whether a module got imported.
export interface RegisteredView {
  name: string;
  view: PgView;
  dependsOn: string[];
}
