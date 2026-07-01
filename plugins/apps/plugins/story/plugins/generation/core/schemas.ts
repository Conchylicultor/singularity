import { z } from "zod";
import { nullable, type FieldsRecord } from "@plugins/fields/core";
import {
  textField,
  enumTextField,
} from "@plugins/fields/plugins/text/plugins/config/core";
import { uuidField } from "@plugins/fields/plugins/uuid/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { wireSchema } from "@plugins/infra/plugins/entities/core";

// Lifecycle of a single generated unit. Format-agnostic: the engine knows
// nothing about blog/markdown/slides — only that a unit is being generated,
// is ready, or failed. The tuple is the single source of truth: the wire enum
// field (`status`) and the `GenStatus` type both derive from it, so they can
// never drift (no separate in-sync guard needed).
export const GEN_STATUSES = ["generating", "ready", "error"] as const;
export type GenStatus = (typeof GEN_STATUSES)[number];

// One row per (page, kind, unit). The physical table (server) and the wire
// schema both derive from this single field record, so a column/schema drift is
// unrepresentable. `prompt` (debug) + `createdAt`/`updatedAt` (timestamps the
// client never reads) stay in the DDL but are kept off the wire via
// `STORY_GENERATED_UNIT_SERVER_ONLY`.
export const storyGeneratedUnitFields = {
  id:          uuidField(),
  pageId:      textField(),
  kind:        textField(),
  unitId:      textField(),
  inputHash:   textField(),
  status:      enumTextField(GEN_STATUSES),
  output:      nullable(textField()),
  prompt:      nullable(textField()),
  instruction: nullable(textField()),
  error:       nullable(textField()),
  createdAt:   dateField(),
  updatedAt:   dateField(),
} satisfies FieldsRecord;

// Columns present in the table DDL but omitted from the wire schema (and never
// fetched by the loader): the debug prompt and the created/updated timestamps.
export const STORY_GENERATED_UNIT_SERVER_ONLY = [
  "prompt",
  "createdAt",
  "updatedAt",
] as const;

// Client-facing row shape — 9 fields (omits prompt + timestamps). Browser-safe.
export const StoryGeneratedUnitRowSchema = wireSchema(
  storyGeneratedUnitFields,
  STORY_GENERATED_UNIT_SERVER_ONLY,
);
export type StoryGeneratedUnitRow = z.infer<typeof StoryGeneratedUnitRowSchema>;
