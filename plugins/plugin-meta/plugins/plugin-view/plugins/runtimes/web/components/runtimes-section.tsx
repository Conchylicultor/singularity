import { Badge } from "@plugins/primitives/plugins/badge/web";
import {
  Section,
  RUNTIME_COLORS,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";

export function RuntimesSection({ node }: { node: PluginNode }) {
  return (
    <Section title="Runtimes">
      <div className="flex flex-wrap gap-1.5">
        {node.runtimes.web && <RuntimePill kind="web" />}
        {node.runtimes.server && <RuntimePill kind="server" />}
        {node.runtimes.central && <RuntimePill kind="central" />}
      </div>
    </Section>
  );
}

function RuntimePill({ kind }: { kind: "web" | "server" | "central" }) {
  return (
    <Badge size="sm" colorClass={RUNTIME_COLORS[kind]}>
      {kind}
    </Badge>
  );
}
