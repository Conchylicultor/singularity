/**
 * Default fallback for the `JsonlViewer.PendingPrompt` dispatch slot: a static
 * "waiting for your input" indicator shown for any `waitingFor` kind that has no
 * contributed variant. Kept generic — no per-kind logic lives here. Hosts the
 * `PendingPromptAction` slot so the terminal-pane plugin can offer an "Open
 * terminal" affordance without jsonl-viewer importing it.
 */
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { JsonlViewer } from "../slots";

export function PendingContentIndicator() {
  return (
    <Stack direction="row" align="center" gap="sm" className="px-xs py-xs">
      <Text as="span" variant="caption" className="text-warning/70">
        Content pending in terminal — waiting for your input
      </Text>
      <JsonlViewer.PendingPromptAction.Render />
    </Stack>
  );
}
