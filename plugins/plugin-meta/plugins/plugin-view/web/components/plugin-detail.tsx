import { MdBolt } from "react-icons/md";
import { pluginIdSegments } from "@plugins/framework/plugins/plugin-id/core";
import { Breadcrumb } from "@plugins/primitives/plugins/breadcrumb/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import type { PluginNode } from "../../core/types";
import { PluginView } from "../slots";

interface PluginDetailProps {
  node: PluginNode | null;
}

export function PluginDetail({ node }: PluginDetailProps) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-12 text-center">
        <Text as="div" variant="body" className="max-w-sm text-muted-foreground">
          Select a plugin to inspect what would be included in its release.
        </Text>
      </div>
    );
  }

  const trail = pluginIdSegments(node.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-3 px-6 pt-6">
          <Text as="div" variant="title" className="flex items-baseline gap-3 tracking-tight">
            <Breadcrumb
              segments={trail.map((seg, i) => ({
                key: String(i),
                label: seg,
              }))}
              actions={
                node.loadBearing ? (
                  <Badge variant="warning" size="sm" icon={<MdBolt />} className="ml-1">
                    Load-bearing
                  </Badge>
                ) : undefined
              }
            />
          </Text>
          {node.description && (
            <Text as="p" variant="body" className="max-w-prose text-muted-foreground">
              {node.description}
            </Text>
          )}
        </header>

        <PluginView.Host node={node} />
      </div>
    </div>
  );
}
