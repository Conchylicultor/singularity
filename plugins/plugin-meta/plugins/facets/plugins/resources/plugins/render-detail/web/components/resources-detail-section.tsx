import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import {
  Section,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { ResourceFacetData } from "@plugins/plugin-meta/plugins/facets/plugins/resources/core";

// Renders the resources facet's own data. Read `node.facets[id]` directly (as
// every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const RESOURCES_FACET_ID = "resources";

type Runtime = "server" | "central";

export function ResourcesDetailSection({ node }: { node: PluginNode }) {
  const data = node.facets?.[RESOURCES_FACET_ID] as ResourceFacetData | undefined;
  if (!data) return null;

  const rows: { key: string; mode: string; runtime: Runtime }[] = [
    ...data.server.map((r) => ({ ...r, runtime: "server" as const })),
    ...data.central.map((r) => ({ ...r, runtime: "central" as const })),
  ];
  if (rows.length === 0) return null;

  return (
    <Section title="Resources" count={String(rows.length)}>
      <Stack gap="2xs">
        {rows.map((r) => (
          <Text
            as="div"
            variant="caption"
            key={`${r.runtime}:${r.key}`}
            className="flex items-center gap-sm px-sm py-2xs"
          >
            <code className="min-w-0 truncate font-mono text-foreground">
              {r.key}
            </code>
            <span className="text-muted-foreground/60">{r.mode}</span>
            <span className="ml-auto shrink-0 text-3xs text-muted-foreground/50">
              {r.runtime}
            </span>
          </Text>
        ))}
      </Stack>
    </Section>
  );
}
