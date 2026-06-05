import {
  Section,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { SlotDef } from "@plugins/plugin-meta/plugins/facets/plugins/slots/core";

// Renders the slots facet's own data. Read `node.facets[id]` directly (as every
// render host does) rather than importing the build-time `facets/core` barrel,
// which would drag `loadFacets` + `fs`/`path` into the browser bundle. The
// type-only import from the facet core is erased and safe.
const SLOTS_FACET_ID = "slots";

export function SlotsDetailSection({ node }: { node: PluginNode }) {
  const data = node.facets?.[SLOTS_FACET_ID] as SlotDef[] | undefined;
  if (!data || data.length === 0) return null;

  return (
    <Section title="Slots" count={`${data.length} slot${data.length !== 1 ? "s" : ""}`}>
      <div className="flex flex-col gap-0.5">
        {data.map((s) => (
          <div
            key={s.slotId}
            className="flex items-center gap-2 px-2 py-0.5 text-xs"
          >
            <code className="font-mono text-foreground">
              {s.groupName}.{s.memberName}
            </code>
            <code className="ml-auto truncate font-mono text-muted-foreground/60">
              {s.slotId}
            </code>
          </div>
        ))}
      </div>
    </Section>
  );
}
