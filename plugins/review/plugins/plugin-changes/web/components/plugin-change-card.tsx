import { MdExpandMore, MdExpandLess } from "react-icons/md";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/card/web";
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
    <Card className="rounded-lg border-border/60 overflow-hidden p-none bg-transparent">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-sm px-md py-sm text-left hover:bg-muted/30"
      >
        {expanded ? (
          <MdExpandLess className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <MdExpandMore className="size-4 text-muted-foreground shrink-0" />
        )}
        <Text as="span" variant="label" className="truncate">
          {plugin.pluginId}
        </Text>
        <Badge
          size="sm"
          colorClass={plugin.status === "added" ? "bg-success/15 text-success" : "bg-info/15 text-info"}
          className="ml-auto shrink-0 font-semibold"
        >
          {formatStatusLabel(plugin.status)}
        </Badge>
        {sections.map((s) => {
          const S = s.summary;
          return S ? (
            <S key={s.id} conversationId={conversationId} plugin={plugin} />
          ) : null;
        })}
      </button>
      {expanded && hasExpandable && (
        <div className="flex flex-col gap-md px-md pb-md pt-xs border-t border-border/40">
          <PluginChanges.Section.Render>
            {(item) => {
              if (item.hasContent && !item.hasContent(plugin)) return null;
              const C = item.component;
              return <C conversationId={conversationId} plugin={plugin} />;
            }}
          </PluginChanges.Section.Render>
        </div>
      )}
    </Card>
  );
}
