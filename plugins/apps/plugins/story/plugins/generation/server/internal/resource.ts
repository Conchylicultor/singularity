import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { storyGeneratedUnitsResource as storyGeneratedUnitsDescriptor } from "../../shared/resources";
import { storyGeneratedUnits } from "./tables";

// Compiled keyed query-resource: the loader, Layer-2 scoped loader, and
// identityTable ("story_generated_units") all derive from this one declaration.
// The entity source's default projection is `wireColumns`, so the server-only
// prompt/timestamps are never fetched (identical to the prior explicit select).
// K/scoped is sound: no `where` (membership changes only via INSERT/DELETE →
// FULL) and no orderBy, so the heavy in-place status/output/inputHash UPDATES a
// generation turn makes ship as single-row keyed deltas — the whole win here.
// The web hook filters by (pageId, kind, unitId) client-side; nothing relies on
// wire order.
export const storyGeneratedUnitsResource = queryResource(
  storyGeneratedUnitsDescriptor,
  {
    from: storyGeneratedUnits,
  },
);
