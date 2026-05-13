import { MdSmartToy } from "react-icons/md";
import { cn } from "@/lib/utils";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plugins/primitives/plugins/collapsible/web";
import { Agents as AgentsSlots } from "../slots";
import { systemAgentDetailPane } from "../panes";

export function SystemFolder({
  selectedSystemId,
}: {
  selectedSystemId?: string;
}) {
  const descriptors = AgentsSlots.SystemAgent.useContributions();
  const openPane = useOpenPane();

  if (descriptors.length === 0) return null;

  return (
    <Collapsible defaultOpen className="mb-2">
      <CollapsibleTrigger className="hover:bg-accent gap-1 rounded px-1 py-1 text-sm">
        <span className="flex size-5 shrink-0 items-center justify-center">
          <CollapsibleChevron className="size-4" />
        </span>
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          System
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col">
        {descriptors.map((d) => {
          const Icon = d.icon ?? MdSmartToy;
          const selected = d.id === selectedSystemId;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => openPane(systemAgentDetailPane, { systemId: d.id })}
              className={cn(
                "flex items-center gap-2 rounded px-1 py-1 text-sm",
                "hover:bg-accent",
                selected && "bg-accent",
              )}
              style={{ paddingLeft: 16 + 4 }}
            >
              <Icon className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate">{d.name}</span>
            </button>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
