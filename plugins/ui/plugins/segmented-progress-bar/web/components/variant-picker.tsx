import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { SegmentedProgressBar } from "../slots";
import { segmentedProgressBarConfig } from "../internal/config";

export function VariantPicker() {
  const variants = SegmentedProgressBar.Variant.useContributions();
  const { variant: activeId } = useConfig(segmentedProgressBarConfig);
  const setConfig = useSetConfig(segmentedProgressBarConfig);

  if (variants.length === 0) {
    return (
      <Text as="span" variant="body" className="text-muted-foreground">
        No variants available
      </Text>
    );
  }

  return (
    <Stack direction="row" gap="sm">
      {variants.map((v) => (
        <button
          key={v.id}
          className={`px-md py-xs text-body rounded-md border transition-colors ${
            v.id === activeId
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
          onClick={() => setConfig("variant", v.id)}
        >
          {v.label}
        </button>
      ))}
    </Stack>
  );
}
