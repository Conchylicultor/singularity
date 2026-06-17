import { MdBolt } from "react-icons/md";
import { pluginIdSegments } from "@plugins/framework/plugins/plugin-id/core";
import { Breadcrumb } from "@plugins/primitives/plugins/breadcrumb/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { PluginNode } from "../../core/types";
import { PluginView } from "../slots";

interface PluginDetailProps {
  node: PluginNode | null;
}

export function PluginDetail({ node }: PluginDetailProps) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-2xl text-center">
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
        <Stack as="header" gap="md" className="px-xl pt-xl">
          <Text as="div" variant="title" className="flex items-baseline gap-md tracking-tight">
            <Breadcrumb
              segments={trail.map((seg, i) => ({
                key: String(i),
                label: seg,
              }))}
              actions={
                node.loadBearing ? (
                  // eslint-disable-next-line spacing/no-adhoc-spacing -- ml-1 offsets this trailing load-bearing badge from the breadcrumb in the actions slot; one-off inline gap, no shared flex parent
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
        </Stack>

        <PluginView.Host node={node} />
      </div>
    </div>
  );
}
