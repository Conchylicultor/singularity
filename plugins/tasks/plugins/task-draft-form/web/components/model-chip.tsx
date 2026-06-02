import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import { ModelSelect } from "@plugins/conversations/plugins/model-provider/web";

export type ChainModel = "queue" | ConversationModel;

export interface ModelChipProps {
  value: ChainModel;
  onChange: (next: ChainModel) => void;
  disabled?: boolean;
}

export function ModelChip({ value, onChange, disabled }: ModelChipProps) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>Auto-launch with</span>
      <ModelSelect
        value={value === "queue" ? null : value}
        onChange={(m) => onChange(m ?? "queue")}
        offLabel="No"
        ariaLabel="Launch model"
        disabled={disabled}
      />
    </div>
  );
}
