import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Section,
  PluginLink,
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
      <Stack gap="2xs">
        {data.map((s) => (
          <Stack gap="2xs" key={s.slotId}>
            <Text
              as="div"
              variant="caption"
              className="flex items-center gap-sm px-sm py-2xs"
            >
              <code className="font-mono text-foreground">
                {s.groupName}.{s.memberName}
              </code>
              <code className="ml-auto truncate font-mono text-muted-foreground/60">
                {s.slotId}
              </code>
            </Text>
            {s.contributors.length > 0 && (
              <Text
                as="div"
                variant="caption"
                className="flex flex-wrap items-center gap-x-xs gap-y-2xs px-sm"
              >
                <span className="shrink-0 text-muted-foreground/60">←</span>
                {s.contributors.map((id) => (
                  <PluginLink
                    key={id}
                    name={id}
                    label={id}
                    className="font-mono text-muted-foreground hover:underline"
                  />
                ))}
              </Text>
            )}
          </Stack>
        ))}
      </Stack>
    </Section>
  );
}
