import { MdExpandMore, MdExpandLess } from "react-icons/md";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/badge/web";
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
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
      >
        {expanded ? (
          <MdExpandLess className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <MdExpandMore className="size-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-medium truncate">
          {plugin.pluginId}
        </span>
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
        <div className="flex flex-col gap-3 px-3 pb-3 pt-1 border-t border-border/40">
          <PluginChanges.Section.Render>
            {(item) => {
              if (item.hasContent && !item.hasContent(plugin)) return null;
              const C = item.component;
              return <C conversationId={conversationId} plugin={plugin} />;
            }}
          </PluginChanges.Section.Render>
        </div>
      )}
    </div>
  );
}
