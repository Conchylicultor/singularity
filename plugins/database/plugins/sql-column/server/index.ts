import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { parsedText } from "./internal/parsed-text";
export type { SqlColumnDirection, SqlColumnFailure } from "./internal/errors";
export { SqlColumnError, formatSqlColumnError } from "./internal/errors";

export default {
  description:
    "Decoded columns: `parsedText` derives a text column's type from a zod schema that really decodes it — on every read and every write — so a column can no longer declare a string-literal union nothing verifies.",
} satisfies ServerPluginDefinition;
