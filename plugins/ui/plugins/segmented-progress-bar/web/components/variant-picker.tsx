import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { SegmentedProgressBar } from "../slots";
import { segmentedProgressBarConfig } from "../internal/config";

export function VariantPicker() {
  const variants = SegmentedProgressBar.Variant.useContributions();
  const { variant: activeId } = useConfig(segmentedProgressBarConfig);
  const setConfig = useSetConfig(segmentedProgressBarConfig);

  if (variants.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">
        No variants available
      </span>
    );
  }

  return (
    <div className="flex gap-2">
      {variants.map((v) => (
        <button
          key={v.id}
          className={`px-3 py-1 text-sm rounded-md border transition-colors ${
            v.id === activeId
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
          onClick={() => setConfig("variant", v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
