import { PrepromptSelect } from "@plugins/conversations/plugins/preprompts/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
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
    <Collapsible defaultOpen>
      <Stack gap="xs">
      <SectionHeaderRow variant="eyebrow">Preprompt</SectionHeaderRow>
      <CollapsibleContent>
        <Stack direction="row" align="center" gap="sm">
          <Text as="span" variant="caption" tone="muted">Append to the agent's system prompt on launch</Text>
          <PrepromptSelect value={current} onChange={handleChange} ariaLabel="Task preprompt" />
        </Stack>
      </CollapsibleContent>
      </Stack>
    </Collapsible>
  );
}
