import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  RUNTIME_COLORS,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";

export function RuntimesSection({ node }: { node: PluginNode }) {
  return (
    <Stack direction="row" wrap gap="xs">
      {node.runtimes.web && <RuntimePill kind="web" />}
      {node.runtimes.server && <RuntimePill kind="server" />}
      {node.runtimes.central && <RuntimePill kind="central" />}
    </Stack>
  );
}

function RuntimePill({ kind }: { kind: "web" | "server" | "central" }) {
  return (
    <Badge colorClass={RUNTIME_COLORS[kind]}>
      {kind}
    </Badge>
  );
}
