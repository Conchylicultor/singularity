import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  SectionCount,
  PluginLink,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { SlotDef } from "@plugins/plugin-meta/plugins/facets/plugins/slots/core";

// Renders the slots facet's own data. Read `node.facets[id]` directly (as every
// render host does) rather than importing the build-time `facets/core` barrel,
// which would drag `loadFacets` + `fs`/`path` into the browser bundle. The
// type-only import from the facet core is erased and safe.
const SLOTS_FACET_ID = "slots";

/** The slots this plugin defines, or `null` when it defines none. */
function slots(node: PluginNode): SlotDef[] | null {
  const data = node.facets?.[SLOTS_FACET_ID] as SlotDef[] | undefined;
  return data && data.length > 0 ? data : null;
}

/** No slots ⇒ the host paints no card at all. */
export function useSlotsAvailable({ node }: { node: PluginNode }): boolean {
  return slots(node) !== null;
}

export function SlotsCount({ node }: { node: PluginNode }) {
  const data = slots(node);
  if (!data) return null;
  return (
    <SectionCount>{`${data.length} slot${data.length !== 1 ? "s" : ""}`}</SectionCount>
  );
}

export function SlotsDetailSection({ node }: { node: PluginNode }) {
  const data = slots(node);
  if (!data) return null;

  return (
    <Stack gap="2xs">
      {data.map((s) => (
        <Stack gap="2xs" key={s.slotId}>
          <Text as="div" variant="caption" className="px-sm py-2xs">
            <Stack direction="row" gap="sm" align="center">
              <code className="font-mono text-foreground">
                {s.groupName}.{s.memberName}
              </code>
              <code className="ml-auto truncate font-mono text-muted-foreground/60">
                {s.slotId}
              </code>
            </Stack>
          </Text>
          {s.contributors.length > 0 && (
            <Cluster gap="xs" className="text-caption gap-y-2xs px-sm">
              <span className="text-muted-foreground/60">←</span>
              {s.contributors.map((id) => (
                <PluginLink
                  key={id}
                  name={id}
                  label={id}
                  className="font-mono text-muted-foreground hover:underline"
                />
              ))}
            </Cluster>
          )}
        </Stack>
      ))}
    </Stack>
  );
}
