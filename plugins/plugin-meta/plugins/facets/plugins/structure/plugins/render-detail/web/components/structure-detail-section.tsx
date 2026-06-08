import { MdWarningAmber } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import {
  Section,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { StructureFacetData } from "@plugins/plugin-meta/plugins/facets/plugins/structure/core";

// Renders the structure facet's own data. Read `node.facets[id]` directly (as
// every render host does) rather than importing the build-time `facets/core`
// barrel, which would drag `loadFacets` + `fs`/`path` into the browser bundle.
// The type-only import from the facet core is erased and safe.
const STRUCTURE_FACET_ID = "structure";

export function StructureDetailSection({ node }: { node: PluginNode }) {
  const data = node.facets?.[STRUCTURE_FACET_ID] as
    | StructureFacetData
    | undefined;
  if (!data) return null;

  const nonStandard = data.folders.filter((f) => !f.standard);
  const loose = data.looseFiles;

  if (!data.compositionRoot && nonStandard.length === 0 && loose.length === 0) {
    return null;
  }

  return (
    <Section title="Structure">
      <div className="flex flex-wrap gap-1.5">
        {data.compositionRoot && (
          <Badge size="sm" variant="info">
            composition root
          </Badge>
        )}
        {nonStandard.map((f) => (
          <Badge
            key={`folder:${f.name}`}
            size="sm"
            variant="warning"
            icon={<MdWarningAmber className="size-3" />}
          >
            {f.name}/
          </Badge>
        ))}
        {loose.map((name) => (
          <Badge
            key={`file:${name}`}
            size="sm"
            variant="warning"
            icon={<MdWarningAmber className="size-3" />}
          >
            {name}
          </Badge>
        ))}
      </div>
    </Section>
  );
}
