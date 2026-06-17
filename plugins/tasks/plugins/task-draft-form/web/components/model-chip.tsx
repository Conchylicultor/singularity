import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import { ModelSelect } from "@plugins/conversations/plugins/model-provider/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export type ChainModel = "queue" | ConversationModel;

export interface ModelChipProps {
  value: ChainModel;
  onChange: (next: ChainModel) => void;
  disabled?: boolean;
}

export function ModelChip({ value, onChange, disabled }: ModelChipProps) {
  return (
    <Text as="div" variant="caption" className="flex items-center gap-xs text-muted-foreground">
      <span>Auto-launch with</span>
      <ModelSelect
        value={value === "queue" ? null : value}
        onChange={(m) => onChange(m ?? "queue")}
        offLabel="No"
        ariaLabel="Launch model"
        disabled={disabled}
      />
    </Text>
  );
}
