import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import { ModelSelect } from "@plugins/conversations/plugins/model-provider/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

export type ChainModel = "queue" | ConversationModel;

export interface ModelChipProps {
  value: ChainModel;
  onChange: (next: ChainModel) => void;
  disabled?: boolean;
}

export function ModelChip({ value, onChange, disabled }: ModelChipProps) {
  return (
    <Stack direction="row" align="center" gap="xs">
      <Text as="span" variant="caption" tone="muted">Auto-launch with</Text>
      <ModelSelect
        value={value === "queue" ? null : value}
        onChange={(m) => onChange(m ?? "queue")}
        offLabel="No"
        ariaLabel="Launch model"
        disabled={disabled}
      />
    </Stack>
  );
}
