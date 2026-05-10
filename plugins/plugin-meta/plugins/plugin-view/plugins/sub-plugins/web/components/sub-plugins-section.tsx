import { MdBolt } from "react-icons/md";
import { Section, type PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/web";

export function SubPluginsSection({ node }: { node: PluginNode }) {
  const directChildren = node.children;
  if (directChildren.length === 0) return null;

  const totalDescendants = countDescendants(node);

  return (
    <Section
      title="Sub-plugins"
      count={
        totalDescendants > directChildren.length
          ? `${directChildren.length} direct · ${totalDescendants} total`
          : `${directChildren.length}`
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {directChildren.map((c) => (
          <span
            key={c.hierarchyId}
            className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs text-foreground"
          >
            {c.name}
            {c.loadBearing && (
              <MdBolt className="size-3 text-amber-500/90" />
            )}
          </span>
        ))}
      </div>
    </Section>
  );
}

function countDescendants(node: PluginNode): number {
  let count = 0;
  for (const c of node.children) count += 1 + countDescendants(c);
  return count;
}
