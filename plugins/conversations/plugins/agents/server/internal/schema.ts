// Zod schemas + types re-exported from `../../shared/schemas.ts` so they can be
// consumed by shared/ and web/ without pulling drizzle into the bundle. The
// derived `agents_v` `pgView` object lives in `./views.ts` (not glob-matched) so
// it is rebuilt from source on boot rather than tracked in the migration chain.
// See plugins/database/plugins/derived-views/CLAUDE.md.

export {
  AgentSchema,
  AgentLaunchSchema,
  AgentLaunchWithStatusSchema,
} from "../../shared/schemas";
export type {
  Agent,
  AgentLaunch,
  AgentLaunchWithStatus,
} from "../../shared/schemas";
