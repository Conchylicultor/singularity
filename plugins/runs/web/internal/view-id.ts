import { defineDataView } from "@plugins/primitives/plugins/data-view/web";

/**
 * The surface id. Scraped by codegen out of `web/**`, so it must be a
 * module-level `defineDataView` call and not a value computed anywhere else.
 *
 * One id for the whole merged space — the tabs (Active / Recent / Builds /
 * Failed …) are view *instances* authored in `config/runs/runs.jsonc`, each one
 * nothing but an ordinary editable filter. Adding "failed builds this week"
 * costs a config row, not code.
 */
export const RUNS_VIEW = defineDataView("runs");
