import { and, eq } from "drizzle-orm";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { storyGeneratedUnitsResource as storyGeneratedUnitsDescriptor } from "../../shared/resources";
import { storyGeneratedUnits, _storyGeneratedUnits } from "./tables";

// Compiled keyed query-resource, scoped per (pageId, kind): the loader, Layer-2
// scoped loader, and identityTable ("story_generated_units") all derive from
// this one declaration. The entity source's default projection is `wireColumns`,
// so the server-only prompt/timestamps are never fetched.
//
// The `where` bounds each subscription to ONE artifact's units, so an open page
// never ships (or re-diffs) rows belonging to any other page.
//
// K/scoped is sound: both `where` columns are immutable post-insert — a unit's
// (pageId, kind, unitId) is the upsert's conflict target and is never UPDATEd,
// so a row can't flip out of the filter and sit stale — and there is no orderBy,
// so the heavy in-place status/output/inputHash UPDATES a generation turn makes
// ship as single-row keyed deltas. The web hook keys the returned rows by
// `unitId`; nothing relies on wire order.
export const storyGeneratedUnitsResource = queryResource(
  storyGeneratedUnitsDescriptor,
  {
    from: storyGeneratedUnits,
    where: ({ pageId, kind }) =>
      and(
        eq(_storyGeneratedUnits.pageId, pageId),
        eq(_storyGeneratedUnits.kind, kind),
      ),
  },
);
