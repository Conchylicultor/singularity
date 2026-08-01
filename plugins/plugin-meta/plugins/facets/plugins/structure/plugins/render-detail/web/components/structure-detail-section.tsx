import { MdWarningAmber } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { StructureFacetData } from "@plugins/plugin-meta/plugins/facets/plugins/structure/core";

// Renders the structure facet's own data. Read `node.facets[id]` directly (as
// every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const STRUCTURE_FACET_ID = "structure";

/** The plugin's structural anomalies, or `null` when it is fully conformant. */
function anomalies(node: PluginNode): StructureFacetData | null {
  const data = node.facets?.[STRUCTURE_FACET_ID] as
    | StructureFacetData
    | undefined;
  if (!data) return null;
  const hasAnomaly =
    data.compositionRoot ||
    data.folders.some((f) => !f.standard) ||
    data.looseFiles.length > 0;
  return hasAnomaly ? data : null;
}

/** A conformant plugin has nothing to flag ⇒ the host paints no card at all. */
export function useStructureAvailable({ node }: { node: PluginNode }): boolean {
  return anomalies(node) !== null;
}

export function StructureDetailSection({ node }: { node: PluginNode }) {
  const data = anomalies(node);
  if (!data) return null;

  const nonStandard = data.folders.filter((f) => !f.standard);

  return (
    <Stack direction="row" wrap gap="xs">
      {data.compositionRoot && <Badge variant="info">composition root</Badge>}
      {nonStandard.map((f) => (
        <Badge
          key={`folder:${f.name}`}
          variant="warning"
          icon={<MdWarningAmber />}
        >
          {f.name}/
        </Badge>
      ))}
      {data.looseFiles.map((name) => (
        <Badge key={`file:${name}`} variant="warning" icon={<MdWarningAmber />}>
          {name}
        </Badge>
      ))}
    </Stack>
  );
}
