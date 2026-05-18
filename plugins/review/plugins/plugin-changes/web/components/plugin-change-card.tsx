import { useState } from "react";
import { MdExpandMore, MdExpandLess } from "react-icons/md";
import type { PluginReviewProps } from "../../core";
import { PluginChanges } from "../slots";

export function PluginChangeCard({ conversationId, plugin }: PluginReviewProps) {
  const sections = PluginChanges.Section.useContributions();
  const hasExpandable = sections.some(
    (s) => s.hasContent?.(plugin) ?? false,
  );
  const [expanded, setExpanded] = useState(hasExpandable);

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
      >
        {expanded ? (
          <MdExpandLess className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <MdExpandMore className="size-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-medium truncate">
          {plugin.hierarchyId}
        </span>
        <span
          className={`ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
            plugin.status === "added"
              ? "bg-green-500/15 text-green-600 dark:text-green-400"
              : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
          }`}
        >
          {plugin.status}
        </span>
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
