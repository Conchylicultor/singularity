import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import {
  StoryGeneratedUnitRowSchema,
  type StoryGeneratedUnitRow,
} from "../core/schemas";

// Browser-safe keyed query-resource contract: rows key on `id`. The row schema +
// type live in `core/` (single source of truth, shared with the server entity),
// so the wire shape can't drift from the table. The server half is compiled from
// the drizzle declaration in `server/internal/resource.ts` (K/scoped — no
// `where`, no orderBy, so in-place status/output flips ship as single-row keyed
// deltas). The wire shape stays `StoryGeneratedUnitRow[]`.
export const storyGeneratedUnitsResource =
  queryResourceDescriptor<StoryGeneratedUnitRow>(
    "story-generated-units",
    StoryGeneratedUnitRowSchema,
    "id",
  );
