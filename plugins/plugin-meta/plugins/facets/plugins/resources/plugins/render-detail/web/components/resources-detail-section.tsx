import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  SectionCount,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { ResourceFacetData } from "@plugins/plugin-meta/plugins/facets/plugins/resources/core";

// Renders the resources facet's own data. Read `node.facets[id]` directly (as
// every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const RESOURCES_FACET_ID = "resources";

type Runtime = "server" | "central";

interface ResourceRow {
  key: string;
  mode: string;
  runtime: Runtime;
}

/** The plugin's resources across both runtimes, or `null` when it declares none. */
function resourceRows(node: PluginNode): ResourceRow[] | null {
  const data = node.facets?.[RESOURCES_FACET_ID] as ResourceFacetData | undefined;
  if (!data) return null;
  const rows: ResourceRow[] = [
    ...data.server.map((r) => ({ ...r, runtime: "server" as const })),
    ...data.central.map((r) => ({ ...r, runtime: "central" as const })),
  ];
  return rows.length > 0 ? rows : null;
}

/** No resources ⇒ the host paints no card at all. */
export function useResourcesAvailable({ node }: { node: PluginNode }): boolean {
  return resourceRows(node) !== null;
}

export function ResourcesCount({ node }: { node: PluginNode }) {
  const rows = resourceRows(node);
  return rows ? <SectionCount>{rows.length}</SectionCount> : null;
}

export function ResourcesDetailSection({ node }: { node: PluginNode }) {
  const rows = resourceRows(node);
  if (!rows) return null;

  return (
    <Stack gap="2xs">
      {rows.map((r) => (
        <Text
          as="div"
          variant="caption"
          key={`${r.runtime}:${r.key}`}
          className="flex items-center gap-sm px-sm py-2xs"
        >
          <Text as="code" className="min-w-0 truncate font-mono text-foreground">
            {r.key}
          </Text>
          <span className="text-muted-foreground/60">{r.mode}</span>
          <span className="ml-auto shrink-0 text-3xs text-muted-foreground/50">
            {r.runtime}
          </span>
        </Text>
      ))}
    </Stack>
  );
}
