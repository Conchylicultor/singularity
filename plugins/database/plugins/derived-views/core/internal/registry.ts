import { getViewConfig } from "drizzle-orm/pg-core";
import type { PgView } from "drizzle-orm/pg-core";

// A registered derived (plain, non-materialized) view. Plain views hold no data
// — they're deterministic code rebuilt from source on every boot. `dependsOn`
// lists the names of OTHER registered views this view reads from, so the
// rebuild can drop/create them in dependency order.
export interface RegisteredView {
  name: string;
  view: PgView;
  dependsOn: string[];
}

// Module-level registry. Populated at module-load time of each plugin's
// `views.ts`, which is imported (transitively) by that plugin's already-loaded
// server barrel — so by the time `onReadyBlocking` runs, every view is here.
const views: RegisteredView[] = [];

export function defineView({
  view,
  dependsOn,
}: {
  view: PgView;
  dependsOn?: string[];
}): void {
  views.push({
    name: getViewConfig(view).name,
    view,
    dependsOn: dependsOn ?? [],
  });
}

export function getRegisteredViews(): RegisteredView[] {
  return views;
}
