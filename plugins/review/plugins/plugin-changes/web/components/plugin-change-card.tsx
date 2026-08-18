import { MdExpandMore, MdExpandLess } from "react-icons/md";
import {
  Badge,
  formatStatusLabel,
} from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { PluginReviewProps } from "../../core";
import { PluginChanges } from "../slots";

export function PluginChangeCard({
  conversationId,
  plugin,
  expanded,
  onToggle,
}: PluginReviewProps & { expanded: boolean; onToggle: () => void }) {
  const sections = PluginChanges.Section.useContributions();
  const hasExpandable = sections.some((s) => s.hasContent?.(plugin) ?? false);

  return (
    <Clip
      as={Card}
      className="rounded-lg border-border/60 p-none bg-transparent"
    >
      <Line
        as="button"
        onClick={onToggle}
        className="w-full gap-sm px-md py-sm text-left hover:bg-muted/30"
      >
        {expanded ? (
          <MdExpandLess
            className={cn("size-4 text-muted-foreground", rigidClass())}
          />
        ) : (
          <MdExpandMore
            className={cn("size-4 text-muted-foreground", rigidClass())}
          />
        )}
        <Text as="span" variant="label" className="truncate">
          {plugin.pluginId}
        </Text>
        {/* Empty grow cell: gives the status badge + summaries their own
            flush-right track instead of an `ml-auto` hint. */}
        <Fill />
        <Badge
          colorClass={
            plugin.status === "added"
              ? "bg-success/15 text-success"
              : "bg-info/15 text-info"
          }
          className={cn(rigidClass(), "font-semibold")}
        >
          {formatStatusLabel(plugin.status)}
        </Badge>
        {sections.map((s) => {
          const S = s.summary;
          return S ? (
            <S key={s.id} conversationId={conversationId} plugin={plugin} />
          ) : null;
        })}
      </Line>
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
    </Clip>
  );
}
