import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { useConfig } from "@plugins/config_v2/web";
import { useAppSettingsScope } from "@plugins/apps-core/plugins/theme-scope/web";
import { SegmentedProgressBar as Slots } from "../slots";
import { segmentedProgressBarConfig } from "../internal/config";
import type { SegmentedProgressBarProps } from "../../core";

export function SegmentedProgressBar<T extends string>(
  props: SegmentedProgressBarProps<T>,
) {
  const contributions = Slots.Variant.useContributions();
  // Read for the app whose theme it wears (a pane's home app, wherever the
  // pane is hosted), so an app can pick its own variant (a committed
  // `@app/<id>` config), falling back to the base choice.
  const scopeId = useAppSettingsScope();
  const { variant: activeId } = useConfig(segmentedProgressBarConfig, {
    scopeId,
  });
  // Select the configured variant, falling back to the first registered one.
  const active =
    contributions.find((c) => c.match === activeId) ?? contributions[0] ?? null;
  if (!active) return null;
  return renderIsolated(
    Slots.Variant,
    active as unknown as Contribution,
    props as SegmentedProgressBarProps,
  );
}
