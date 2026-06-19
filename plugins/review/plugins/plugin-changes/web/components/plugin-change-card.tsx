import { MdExpandMore, MdExpandLess } from "react-icons/md";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { PluginReviewProps } from "../../core";
import { PluginChanges } from "../slots";

export function PluginChangeCard({
  conversationId,
  plugin,
  expanded,
  onToggle,
}: PluginReviewProps & { expanded: boolean; onToggle: () => void }) {
  const sections = PluginChanges.Section.useContributions();
  const hasExpandable = sections.some(
    (s) => s.hasContent?.(plugin) ?? false,
  );

  return (
    <Card
      // eslint-disable-next-line layout/no-adhoc-layout -- clip children to the card's own rounded corners; Card has no clip prop
      className="rounded-lg border-border/60 overflow-hidden p-none bg-transparent"
    >
      <button
        onClick={onToggle}
        className="w-full px-md py-sm text-left hover:bg-muted/30"
      >
        <Frame
          leading={
            expanded ? (
              <MdExpandLess className="size-4 text-muted-foreground" />
            ) : (
              <MdExpandMore className="size-4 text-muted-foreground" />
            )
          }
          content={
            <Text as="div" variant="label" className="truncate">
              {plugin.pluginId}
            </Text>
          }
          trailing={
            <>
              <Badge
                size="sm"
                colorClass={plugin.status === "added" ? "bg-success/15 text-success" : "bg-info/15 text-info"}
                className="font-semibold"
              >
                {formatStatusLabel(plugin.status)}
              </Badge>
              {sections.map((s) => {
                const S = s.summary;
                return S ? (
                  <S key={s.id} conversationId={conversationId} plugin={plugin} />
                ) : null;
              })}
            </>
          }
        />
      </button>
      {expanded && hasExpandable && (
        <Stack gap="md" className="px-md pb-md pt-xs border-t border-border/40">
          <PluginChanges.Section.Render>
            {(item) => {
              if (item.hasContent && !item.hasContent(plugin)) return null;
              const C = item.component;
              return <C conversationId={conversationId} plugin={plugin} />;
            }}
          </PluginChanges.Section.Render>
        </Stack>
      )}
    </Card>
  );
}
