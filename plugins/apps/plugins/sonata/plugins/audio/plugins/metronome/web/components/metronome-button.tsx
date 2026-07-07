import type { CSSProperties } from "react";
import { MdAvTimer } from "react-icons/md";
import { scoreEndBeat } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel, Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Separator } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
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

// Clicks-per-beat, presented as the standard musical subdivisions. The id maps
// 1:1 to the `subdivision` int; the `title` names the note value on hover.
const SUBDIVISION_OPTIONS = [
  { id: "1", label: "1", title: "Quarter notes (one click per beat)" },
  { id: "2", label: "2", title: "Eighth notes (two per beat)" },
  { id: "3", label: "3", title: "Triplets (three per beat)" },
  { id: "4", label: "4", title: "Sixteenth notes (four per beat)" },
] as const;

/**
 * The metronome toolbar control (`SonataToolbar.End`): a single button that opens
 * the metronome popover. The button itself reflects the click-track state (filled
 * = on, like the Loop toggle) at a glance; opening it reveals a master on/off
 * toggle at the top plus the count-in length, click volume, and downbeat-accent
 * settings. All values are the `sonata.metronome` config (read via `useConfig`,
 * written via `useSetConfig`), so they persist and stay in sync with the Settings
 * pane.
 */
export function MetronomeButton() {
  const { score } = useSonata();
  const { continuous, countInBars, volume, accentDownbeat, subdivision } =
    useConfig(metronomeConfig);
  const setConfig = useSetConfig(metronomeConfig);
  const hasScore = scoreEndBeat(score) > 0;

  return (
    <InlinePopover
      tooltip="Metronome"
      align="end"
      trigger={
        <IconButton
          icon={MdAvTimer}
          label="Metronome"
          variant={continuous ? "default" : "ghost"}
          disabled={!hasScore}
        />
      }
    >
      <Stack gap="md">
        <Stack direction="row" gap="md" align="center" justify="between">
          <Text variant="label">Metronome</Text>
          <ToggleChip
            active={continuous}
            variant="solid"
            onClick={() => setConfig("continuous", !continuous)}
          >
            {continuous ? "On" : "Off"}
          </ToggleChip>
        </Stack>

        <Separator />

        <Stack gap="xs">
          <SectionLabel>Subdivision</SectionLabel>
          <SegmentedControl
            options={SUBDIVISION_OPTIONS}
            value={String(subdivision)}
            onChange={(id) => setConfig("subdivision", Number(id))}
            variant="ghost"
          />
        </Stack>

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
  );
}
