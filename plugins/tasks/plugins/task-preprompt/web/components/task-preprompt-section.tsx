import { PrepromptSelect } from "@plugins/conversations/plugins/preprompts/web";
import { toast } from "@plugins/notifications/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { useTaskPreprompt } from "../hooks";
import { setTaskPrepromptRemote } from "../internal/api";

export function TaskPrepromptSection({ taskId }: { taskId: string }) {
  const current = useTaskPreprompt(taskId);

  const handleChange = (id: string | null) => {
    setTaskPrepromptRemote(taskId, id).catch((err) => {
      toast({
        type: "task",
        title: "Failed to set preprompt",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    });
  };

  return (
    <Collapsible defaultOpen className="flex flex-col gap-1.5">
      <SectionHeaderRow variant="eyebrow">Preprompt</SectionHeaderRow>
      <CollapsibleContent>
        <Text as="div" variant="caption" tone="muted" className="flex items-center gap-2">
          <span>Append to the agent's system prompt on launch</span>
          <PrepromptSelect value={current} onChange={handleChange} ariaLabel="Task preprompt" />
        </Text>
      </CollapsibleContent>
    </Collapsible>
  );
}
