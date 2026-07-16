import { implement } from "@plugins/infra/plugins/endpoints/server";
import { listPages } from "../../core/endpoints";
import { PageRowSchema } from "../../core/schemas";
import { loadPages } from "./resources";

// Delegates to `loadPages` — the SAME function behind the `pages` live resource,
// so this HTTP read and the pushed value can never disagree. It used to run its
// own `ORDER BY rank` select, which is a second (and wrong) definition of page
// order: `rank` is comparable only within one `(parent_id, rank)` space, while a
// page's sidebar siblings can span several. One concept, one loader.
export const handleListPages = implement(listPages, async () => {
  const rows = await loadPages();
  return rows.map((r) => PageRowSchema.parse(r));
});
