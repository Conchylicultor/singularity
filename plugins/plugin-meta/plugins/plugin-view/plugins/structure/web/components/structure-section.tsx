import { MdWarningAmber } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Section, type PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/web";

export function StructureSection({ node }: { node: PluginNode }) {
  const nonStandard = node.folders.filter((f) => !f.standard);
  const loose = node.looseFiles;

  if (!node.compositionRoot && nonStandard.length === 0 && loose.length === 0) {
    return null;
  }

  return (
    <Section title="Structure">
      <div className="flex flex-wrap gap-1.5">
        {node.compositionRoot && (
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
