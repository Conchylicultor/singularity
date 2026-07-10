import { useMemo } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  VOICINGS,
  voicingConfig,
} from "@plugins/apps/plugins/sonata/plugins/voicing/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  SegmentedControl,
  ToggleChip,
} from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { MdRemove, MdAdd } from "react-icons/md";

/** Octave clamp for the chord voicing (C4 = middle C). */
const MIN_OCTAVE = 1;
const MAX_OCTAVE = 7;

/**
 * The "Voicing" section — the BODY of a `Sonata.Section` card whose chrome
 * (Card + collapsible "Voicing" title) the host paints. Exposes the GLOBAL
 * chord-voicing config (realistic voice-leading on/off, the voicing-strategy,
 * and the chord octave). Writes go to `voicingConfig`, so the shell's `baseScore`
 * re-derives the chord notes from authored chord annotations.
 *
 * Hidden for MIDI-only songs: a song must carry at least one authored chord
 * annotation (a symbol source is loaded) for these controls to mean anything.
 * That applicability gate is the contribution's `useAvailable`
 * (`useHasAuthoredChord`) — the card is not painted at all otherwise — so this
 * body never needs a `return null`.
 */
export function VoicingControls() {
  const cfg = useConfig(voicingConfig);
  const setCfg = useSetConfig(voicingConfig);

  const strategyOptions = useMemo(
    () => VOICINGS.map((v) => ({ id: v.id, label: v.label })),
    [],
  );

  return (
    <Stack gap="md">
      <Stack direction="row" gap="sm" justify="between" align="center">
        <Text as="span" variant="body">
          Realistic voicing
        </Text>
        <ToggleChip
          active={cfg.realistic}
          onClick={() => setCfg("realistic", !cfg.realistic)}
        >
          {cfg.realistic ? "On" : "Off"}
        </ToggleChip>
      </Stack>

      <Stack gap="xs">
        <Text as="div" variant="caption" tone="muted">
          Strategy
        </Text>
        <SegmentedControl
          options={strategyOptions}
          value={cfg.strategyId}
          onChange={(id) => setCfg("strategyId", id)}
        />
      </Stack>

      <Stack direction="row" gap="sm" justify="between" align="center">
        <Text as="span" variant="body">
          Octave
        </Text>
        <Stack direction="row" gap="xs" align="center">
          <IconButton
            icon={MdRemove}
            label="Lower octave"
            disabled={cfg.octave <= MIN_OCTAVE}
            onClick={() =>
              setCfg("octave", Math.max(MIN_OCTAVE, cfg.octave - 1))
            }
          />
          <Text as="span" variant="body" className="tabular-nums">
            {cfg.octave}
          </Text>
          <IconButton
            icon={MdAdd}
            label="Raise octave"
            disabled={cfg.octave >= MAX_OCTAVE}
            onClick={() =>
              setCfg("octave", Math.min(MAX_OCTAVE, cfg.octave + 1))
            }
          />
        </Stack>
      </Stack>
    </Stack>
  );
}
