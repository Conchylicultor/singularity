import { z } from "zod";
import {
  type FieldDef,
  type FieldMeta,
  pickMeta,
} from "@plugins/config_v2/core";
import { directoryPathFieldType } from "@plugins/fields/plugins/directory-path/core";

export interface DirPathFieldDef extends FieldDef<string> {
  readonly type: typeof directoryPathFieldType;
}

/**
 * A config field for an absolute host directory path. Rendered as a folder
 * picker (typeable input + browse popover). The schema stays `z.string()`:
 * existence is advisory UI feedback, not a hard save gate, so empty/in-progress
 * values and default-backfill never break.
 */
export function dirPathField(
  opts?: FieldMeta & { default?: string },
): DirPathFieldDef {
  return Object.freeze({
    type: directoryPathFieldType,
    schema: z.string(),
    defaultValue: opts?.default ?? "",
    meta: pickMeta(opts),
  });
}
