import type { CSSProperties } from "react";
import { MdAvTimer, MdTune } from "react-icons/md";
import { scoreEndBeat } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  SegmentedControl,
  ToggleChip,
} from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { metronomeConfig } from "../../shared/config";
import "./metronome-button.css";

// Count-in lengths as a single-select segmented control. The ids are strings
// (SegmentedControl is keyed by string); they map 1:1 to the `countInBars` int.
const COUNT_IN_OPTIONS = [
  { id: "0", label: "Off" },
  { id: "1", label: "1 bar" },
  { id: "2", label: "2 bars" },
] as const;

/**
 * The metronome toolbar control (`SonataToolbar.End`): a click-track toggle plus
 * a settings popover. The primary button toggles the continuous click on/off
 * (filled = on, like the Loop toggle); the adjacent gear opens a popover with the
 * count-in length, click volume, and downbeat-accent settings. All values are the
 * `sonata.metronome` config (read via `useConfig`, written via `useSetConfig`),
 * so they persist and stay in sync with the Settings pane.
 */
export function MetronomeButton() {
  const { score } = useSonata();
  const { continuous, countInBars, volume, accentDownbeat } =
    useConfig(metronomeConfig);
  const setConfig = useSetConfig(metronomeConfig);
  const hasScore = scoreEndBeat(score) > 0;

  return (
    <Stack direction="row" gap="xs" align="center">
      <IconButton
        icon={MdAvTimer}
        label="Metronome"
        tooltip="Metronome"
        variant={continuous ? "default" : "ghost"}
        disabled={!hasScore}
        onClick={() => setConfig("continuous", !continuous)}
      />

      <InlinePopover
        tooltip="Metronome settings"
        align="end"
        trigger={
          <IconButton
            icon={MdTune}
            label="Metronome settings"
            variant="ghost"
          />
        }
      >
        <Stack gap="md">
          <Stack gap="xs">
            <SectionLabel>Count-in</SectionLabel>
            <SegmentedControl
              options={COUNT_IN_OPTIONS}
              value={String(countInBars)}
              onChange={(id) => setConfig("countInBars", Number(id))}
              variant="ghost"
            />
          </Stack>

          <Stack gap="xs">
            <SectionLabel>Click volume</SectionLabel>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setConfig("volume", Number(e.target.value))}
              aria-label="Click volume"
              className="metronome-slider w-40"
              style={{ "--fill": volume * 100 } as CSSProperties}
            />
          </Stack>

          <ToggleChip
            active={accentDownbeat}
            variant="ghost"
            onClick={() => setConfig("accentDownbeat", !accentDownbeat)}
          >
            Accent downbeat
          </ToggleChip>
        </Stack>
      </InlinePopover>
    </Stack>
  );
}
