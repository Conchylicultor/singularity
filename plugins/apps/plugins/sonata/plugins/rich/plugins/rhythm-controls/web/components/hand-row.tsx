import {
  effectiveOnsets,
  patternFromPreset,
  resample,
  rotate,
  RHYTHMS,
  type RhythmPattern,
} from "@plugins/apps/plugins/sonata/plugins/rhythm/core";
import { figurationsForHand } from "@plugins/apps/plugins/sonata/plugins/voicing/core";
import {
  ControlSizeProvider,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  ControlPanel,
  ControlPanelPopover,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { HAND_COLORS, type Hand } from "./hand-colors";

const addIcon = symbol("add");
const removeIcon = symbol("remove");
const moreIcon = symbol("more-horiz");

/** Subdivision clamp mirrors `resample`'s own [1, 48] bound. */
const MIN_STEPS = 1;
const MAX_STEPS = 48;

/** The Rhythm select's value while the hand's necklace matches no rhythm. */
const CUSTOM = "custom";

const HAND_LABEL: Record<Hand, string> = {
  chord: "Right hand (chords)",
  bass: "Left hand (bass)",
};

/**
 * Whether `pattern` still strikes exactly its rhythm's own necklace — same
 * pulse count, same effective onsets. A bead toggle (no rhythm), a rotation or
 * a step change each make it "Custom".
 */
function matchesRhythm(pattern: RhythmPattern): boolean {
  if (pattern.presetId === null) return false;
  const native = patternFromPreset(pattern.presetId);
  if (native.subdivisions !== pattern.subdivisions) return false;
  const a = effectiveOnsets(native);
  const b = effectiveOnsets(pattern);
  return a.length === b.length && a.every((o, i) => o === b[i]);
}

export interface HandRowProps {
  hand: Hand;
  pattern: RhythmPattern;
  onChange: (next: RhythmPattern) => void;
  /** The hand's tone-order figuration id (the *what*). */
  figurationId: string;
  onFigurationChange: (id: string) => void;
}

/**
 * One hand's controls on one line: its colour dot (the ring it owns on the
 * circle), the **Pattern** select (the figuration — *what* it plays), the
 * **Rhythm** select (the onset necklace — *when*; it snaps the ring to the
 * rhythm's native length) and a `⋯` panel holding the rarer necklace dials,
 * Rotate and Steps (the step change proportionally adapts the pattern).
 * The Rhythm select reads "Custom" once the necklace no longer matches its
 * rhythm.
 */
export function HandRow({
  hand,
  pattern,
  onChange,
  figurationId,
  onFigurationChange,
}: HandRowProps) {
  const label = HAND_LABEL[hand];
  const custom = !matchesRhythm(pattern);
  const rhythmValue =
    !custom && pattern.presetId !== null ? pattern.presetId : CUSTOM;

  // base-ui resolves the collapsed trigger label from `items`, not the option list.
  const rhythmItems: Record<string, string> = {
    ...(custom ? { [CUSTOM]: "Custom" } : {}),
    ...Object.fromEntries(RHYTHMS.map((r) => [r.id, r.label])),
  };
  const figurations = figurationsForHand(hand);
  const figurationItems: Record<string, string> = Object.fromEntries(
    figurations.map((f) => [f.id, f.label]),
  );

  return (
    <ControlSizeProvider size="sm">
      <Stack direction="row" gap="xs" align="center">
        <span title={label}>
          <StatusDot colorClass={HAND_COLORS[hand].dotClass} />
        </span>
        <Fill>
          <Select
            items={figurationItems}
            value={figurationId}
            onValueChange={(v: string | null) => {
              if (v) onFigurationChange(v);
            }}
          >
            <SelectTrigger aria-label={`${label} pattern`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {figurations.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Fill>
        <Fill>
          <Select
            items={rhythmItems}
            value={rhythmValue}
            onValueChange={(v: string | null) => {
              if (v && v !== CUSTOM) onChange(patternFromPreset(v));
            }}
          >
            <SelectTrigger aria-label={`${label} rhythm`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {custom && (
                <SelectItem value={CUSTOM} disabled>
                  Custom
                </SelectItem>
              )}
              {RHYTHMS.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Fill>
        <ControlPanelPopover
          align="end"
          label={`${label} rotate and steps`}
          trigger={
            <IconButton icon={moreIcon} label={`${label}: rotate, steps`} />
          }
        >
          <ControlPanel.Section>
            <ControlPanel.Setting
              label="Rotate"
              fit="inline"
              control={
                <Stepper
                  value={pattern.rotation}
                  lessLabel="Rotate left"
                  moreLabel="Rotate right"
                  onStep={(delta) => onChange(rotate(pattern, delta))}
                />
              }
            />
            <ControlPanel.Setting
              label="Steps"
              fit="inline"
              control={
                <Stepper
                  value={pattern.subdivisions}
                  lessLabel="Fewer steps"
                  moreLabel="More steps"
                  min={MIN_STEPS}
                  max={MAX_STEPS}
                  onStep={(delta) =>
                    onChange(resample(pattern, pattern.subdivisions + delta))
                  }
                />
              }
            />
          </ControlPanel.Section>
        </ControlPanelPopover>
      </Stack>
    </ControlSizeProvider>
  );
}

/** `− n +`, each button disabled at its bound (when one is given). */
function Stepper({
  value,
  lessLabel,
  moreLabel,
  min,
  max,
  onStep,
}: {
  value: number;
  lessLabel: string;
  moreLabel: string;
  min?: number;
  max?: number;
  onStep: (delta: -1 | 1) => void;
}) {
  return (
    <Stack direction="row" gap="xs" align="center">
      <IconButton
        icon={removeIcon}
        label={lessLabel}
        disabled={min !== undefined && value <= min}
        onClick={() => onStep(-1)}
      />
      <Text
        as="span"
        variant="body"
        className="min-w-[2ch] text-center tabular-nums"
      >
        {value}
      </Text>
      <IconButton
        icon={addIcon}
        label={moreLabel}
        disabled={max !== undefined && value >= max}
        onClick={() => onStep(1)}
      />
    </Stack>
  );
}
