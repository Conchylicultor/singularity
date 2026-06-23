import {
  createSchema,
  createBuilder,
  definePermissions,
  table,
  string,
  number,
  ANYONE_CAN_DO_ANYTHING,
} from "@rocicorp/zero";

// Pilot Zero schema mapping raw `tasks` columns. NO `rank` column: Zero
// silently drops the `rank_text` type (Stage-0 finding), so the pilot avoids
// ordered lists and sorts by `updatedAt` instead. timestamptz arrives as an
// epoch number.
const task = table("task")
  .from("tasks")
  .columns({
    id: string(),
    title: string(),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id");

// `enableLegacyQueries: true` is REQUIRED for builder/ZQL queries (those built
// via `createBuilder(schema)`, i.e. `zql.task.where(...)`) to actually sync.
// Zero 1.6.2 defaults it to `false` (zero-client/.../zero.js:251), which makes
// the legacy desired-query registration callback a no-op — the client connects,
// receives empty pokes, but NEVER sends `changeDesiredQueries`, so 0 rows ever
// render. This was the exact Stage-0 "unproven last mile". Zero's newer model is
// named/custom queries; builder queries are the deprecated "legacy" path and
// must be explicitly opted in.
export const schema = createSchema({
  tables: [task],
  relationships: [],
  enableLegacyQueries: true,
});
export const zql = createBuilder(schema);
export type Schema = typeof schema;

// Open read-only permissions for Stage 1. MUST be ANYONE_CAN_DO_ANYTHING (the
// table-level grant), NOT ANYONE_CAN (a single rule that silently compiles to
// deny — Stage-0 footgun #3). Declarative permissions are deprecated in Zero;
// the mutator/auth model is Stage 3.
export const permissions = definePermissions<unknown, Schema>(schema, () => ({
  task: ANYONE_CAN_DO_ANYTHING,
}));
