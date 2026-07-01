import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  fieldsToZodObject,
  nullable,
  type FieldsRecord,
} from "@plugins/fields/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";

// Worktree-local holding area for config documents staged as "default for
// everyone". Last-write-wins per (plugin_id, config_name) — the composite key
// that derives the on-disk config storePath. The physical `staged_config_default`
// table (server/internal/tables.ts) and this wire schema both derive from this
// single field record, so a column ↔ schema drift is unrepresentable.
//
// `value` is the full config document (a field-map object), kept loosely typed
// (`unknown`) on purpose: canonical validation against the descriptor schema
// runs at *apply* time, so one malformed staged row never blanks the resource.
export const stagedConfigDefaultFields = {
  pluginId: textField(),
  configName: textField(),
  value: jsonField<unknown>({ schema: z.unknown(), default: {} }),
  authorId: nullable(textField()),
  updatedAt: dateField(),
} satisfies FieldsRecord;

export const StagedConfigDefaultSchema = fieldsToZodObject(stagedConfigDefaultFields);
export type StagedConfigDefault = z.infer<typeof StagedConfigDefaultSchema>;

export const stagedConfigDefaultsResource = resourceDescriptor<StagedConfigDefault[]>(
  "config-v2-staged-defaults",
  z.array(StagedConfigDefaultSchema),
  [],
);
