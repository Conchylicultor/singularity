import { useConfigValues, setConfigValue } from "@plugins/config/web";
import { SegmentedProgressBar } from "../slots";
import { segmentedProgressBarConfig } from "../internal/config";

const PLUGIN_ID = "ui-segmented-progress-bar";
const FULL_KEY = `${PLUGIN_ID}.variant`;

export function VariantPicker() {
  const variants = SegmentedProgressBar.Variant.useContributions();
  const { variant: activeId } = useConfigValues(
    segmentedProgressBarConfig,
    PLUGIN_ID,
  );

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
          onClick={() => setConfigValue(FULL_KEY, v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
