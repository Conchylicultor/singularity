import { MdBolt } from "react-icons/md";
import { pluginIdSegments } from "@plugins/framework/plugins/plugin-id/core";
import { Breadcrumb } from "@plugins/primitives/plugins/breadcrumb/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import type { PluginNode } from "../../core/types";
import { PluginView } from "../slots";

interface PluginDetailProps {
  node: PluginNode | null;
}

export function PluginDetail({ node }: PluginDetailProps) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-12 text-center">
        <div className="max-w-sm text-sm text-muted-foreground">
          Select a plugin to inspect what would be included in its release.
        </div>
      </div>
    );
  }

  const trail = pluginIdSegments(node.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-col gap-3 px-6 pt-6">
          <div className="flex items-baseline gap-3 text-2xl font-semibold tracking-tight">
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
          </div>
          {node.description && (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {node.description}
            </p>
          )}
        </header>

        <PluginView.Host node={node} />
      </div>
    </div>
  );
}
