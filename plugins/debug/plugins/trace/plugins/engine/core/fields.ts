import { z } from "zod";
import { fieldsToZodObject, type FieldsRecord } from "@plugins/fields/core";
import { uuidField } from "@plugins/fields/plugins/uuid/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { floatField } from "@plugins/fields/plugins/float/plugins/config/core";
import { jsonField } from "@plugins/fields/plugins/json/plugins/config/core";
import { TraceSnapshotSchema, type TraceSnapshot } from "./types";

// One durable trace row. The `traces` table AND the `Trace` wire schema both
// derive from this single record (via defineEntity in server/internal/tables.ts
// and fieldsToZodObject here), so a column/schema drift is unrepresentable —
// the boot-profile storage precedent.
//
// The flat trigger* / duration* / threshold* columns are list metadata: the
// list endpoint reads them WITHOUT ever selecting the (potentially tens-of-KB)
// `snapshot` blob. `createdAt` carries the index that serves both list ordering
// (newest first) and the 7-day sweep's range delete.
export const traceFields = {
  id: uuidField(),
  worktree: textField(),
  triggerKind: textField(),
  triggerLabel: textField(),
  durationMs: floatField(),
  thresholdMs: floatField(),
  snapshot: jsonField<TraceSnapshot>({
    schema: TraceSnapshotSchema,
    default: {} as TraceSnapshot,
  }),
  createdAt: dateField(),
} satisfies FieldsRecord;

export const TraceSchema = fieldsToZodObject(traceFields);
export type Trace = z.infer<typeof TraceSchema>;
