import { useConfig } from "@plugins/config_v2/web";
import { SegmentedProgressBar as Slots } from "../slots";
import { segmentedProgressBarConfig } from "../internal/config";
import type { SegmentedProgressBarProps } from "../../core";

export function SegmentedProgressBar<T extends string>(
  props: SegmentedProgressBarProps<T>,
) {
  const variants = Slots.Variant.useContributions();
  const { variant: activeId } = useConfig(segmentedProgressBarConfig);
  const active =
    variants.find((v) => v.id === activeId) ?? variants[0] ?? null;
  if (!active) return null;
  const Renderer = active.component;
  return <Renderer {...(props as SegmentedProgressBarProps)} />;
}
