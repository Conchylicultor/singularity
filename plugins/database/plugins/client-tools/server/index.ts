import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  pgClientBin,
  PgClientToolMissingError,
  type PgClientTool,
} from "./internal/bin";

export default {
  description:
    "Postgres client tools (pg_dump, pg_restore) built from the same release as the embedded server: pgClientBin resolves the vendored binary, never the PATH.",
} satisfies ServerPluginDefinition;
