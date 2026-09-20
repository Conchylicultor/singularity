import {
  REVEAL_MODES,
  type RevealMode,
} from "@plugins/apps/plugins/chord/plugins/reveal/core";
import { useSetConfig } from "@plugins/config_v2/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { revealConfig } from "../../shared/config";
import { useReveal } from "../internal/use-reveal";

/**
 * The short spelling of each value, for a control that has to fit beside two
 * others. The long prose lives on the config field, which is what Settings
 * shows. A `Record` over the union, so a fourth mode is a tsc error here rather
 * than a blank chip.
 */
const SWITCH_LABEL: Record<RevealMode, string> = {
  off: "Off",
  names: "Names",
  keyboard: "Keyboard",
};

const OPTIONS: readonly SegmentedOption<RevealMode>[] = REVEAL_MODES.map(
  (id) => ({ id, label: SWITCH_LABEL[id] }),
);

/**
 * How much the trainer reveals, as the side panel's first row. It reads and
 * writes the config itself, so the panel hands it nothing — and it sits above
 * the stats rather than beside the round, because it is a setting about how the
 * learner wants to practise, not part of the round.
 */
export function RevealSwitch() {
  const reveal = useReveal();
  const setConfig = useSetConfig(revealConfig);
  return (
    <Stack gap="sm">
      <Text variant="caption" tone="faint" className="font-semibold">
        Reveal
      </Text>
      <SegmentedControl<RevealMode>
        options={OPTIONS}
        value={reveal}
        variant="ghost"
        onChange={(mode) => setConfig("mode", mode)}
      />
    </Stack>
  );
}
