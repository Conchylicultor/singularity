import { MdSmartToy } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plugins/primitives/plugins/collapsible/web";
import { Row } from "@plugins/primitives/plugins/row/web";
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
    <Collapsible
      defaultOpen
      // eslint-disable-next-line spacing/no-adhoc-spacing -- extra bottom offset separating the System folder from the agent tree below
      className="mb-2"
    >
      <CollapsibleTrigger className="hover:bg-accent gap-xs rounded-md px-xs py-xs text-body">
        <span className="flex size-5 shrink-0 items-center justify-center">
          <CollapsibleChevron className="size-4" />
        </span>
        <SectionLabel as="span">
          System
        </SectionLabel>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col">
        {descriptors.map((d) => {
          const Icon = d.icon ?? MdSmartToy;
          const selected = d.id === selectedSystemId;
          return (
            <Row
              key={d.id}
              selected={selected}
              indent={16 + 4}
              icon={<Icon className="text-muted-foreground shrink-0" />}
              onClick={() => openPane(systemAgentDetailPane, { systemId: d.id }, { mode: "push" })}
            >
              <span className="truncate">{d.name}</span>
            </Row>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
