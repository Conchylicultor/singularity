import { useConfigValues } from "@plugins/config/web";
import { SegmentedProgressBar as Slots } from "../slots";
import { segmentedProgressBarConfig } from "../internal/config";
import type { SegmentedProgressBarProps } from "../../shared";

const PLUGIN_ID = "ui-segmented-progress-bar";

export function SegmentedProgressBar<T extends string>(
  props: SegmentedProgressBarProps<T>,
) {
  const variants = Slots.Variant.useContributions();
  const { variant: activeId } = useConfigValues(
    segmentedProgressBarConfig,
    PLUGIN_ID,
  );
  const active =
    variants.find((v) => v.id === activeId) ?? variants[0] ?? null;
  if (!active) return null;
  const Renderer = active.component;
  return <Renderer {...(props as SegmentedProgressBarProps)} />;
}
