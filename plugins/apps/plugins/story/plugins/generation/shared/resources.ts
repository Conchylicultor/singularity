import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import {
  StoryGeneratedUnitRowSchema,
  type StoryGeneratedUnitRow,
} from "../core/schemas";

// The generated units of ONE (page, kind) artifact — what a single open story
// page renders. A keyed query-resource parameterized by `{ pageId, kind }`, rows
// keyed on `id`, so a subscriber loads only its own page's units instead of the
// app-wide table (which grows unboundedly with every page ever generated).
// `pageId`/`kind` are not the identity pk (that is the row uuid), so a `point`
// resource cannot express this membership — the per-key parameterized form is
// the shape, same as mail's per-thread messages.
//
// The row schema + type live in `core/` (single source of truth, shared with the
// server entity), so the wire shape can't drift from the table. The server half
// is compiled from the drizzle declaration in `server/internal/resource.ts`
// (K/scoped — its `where` reads only immutable columns, and there is no orderBy,
// so in-place status/output flips ship as single-row keyed deltas). The wire
// shape stays `StoryGeneratedUnitRow[]`.
export const storyGeneratedUnitsResource = queryResourceDescriptor<
  StoryGeneratedUnitRow,
  { pageId: string; kind: string }
>("story-generated-units", StoryGeneratedUnitRowSchema, "id");
