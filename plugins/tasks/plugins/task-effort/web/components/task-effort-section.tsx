import { EffortSelect } from "@plugins/conversations/plugins/effort-provider/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import type { EffortLevel } from "@plugins/conversations/plugins/effort-provider/core";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useTaskEffort } from "../hooks";
import { setTaskEffortRemote } from "../internal/api";

export function TaskEffortSection({ taskId }: { taskId: string }) {
  const current = useTaskEffort(taskId);

  const handleChange = (level: EffortLevel | null) => {
    setTaskEffortRemote(taskId, level).catch((err) => {
      toast({
        type: "task",
        title: "Failed to set thinking mode",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    });
  };

  return (
    <Collapsible defaultOpen>
      <Stack gap="xs">
        <SectionHeaderRow variant="eyebrow">Thinking mode</SectionHeaderRow>
        <CollapsibleContent>
          <Stack direction="row" align="center" gap="sm">
            <Text as="span" variant="caption" tone="muted">Claude Code effort level applied when an agent launches</Text>
            <EffortSelect value={current} onChange={handleChange} ariaLabel="Task thinking mode" />
          </Stack>
        </CollapsibleContent>
      </Stack>
    </Collapsible>
  );
}
