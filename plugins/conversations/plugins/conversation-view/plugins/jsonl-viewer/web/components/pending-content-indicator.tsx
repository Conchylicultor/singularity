/**
 * Default fallback for the `JsonlViewer.PendingPrompt` dispatch slot: a static
 * "waiting for your input" indicator shown for any `waitingFor` kind that has no
 * contributed variant. Kept generic — no per-kind logic lives here.
 */
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export function PendingContentIndicator() {
  return (
    <div className="flex items-center gap-sm px-xs py-xs">
      <Text as="span" variant="caption" className="text-warning/70">
        Content pending in terminal — waiting for your input
      </Text>
    </div>
  );
}
