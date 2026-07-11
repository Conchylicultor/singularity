import {
  findRhythm,
  patternFromPreset,
  resample,
  rotate,
  RHYTHMS,
  type RhythmPattern,
} from "@plugins/apps/plugins/sonata/plugins/rhythm/core";
import { figurationsForHand } from "@plugins/apps/plugins/sonata/plugins/voicing/core";
import {
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { MdAdd, MdRemove } from "react-icons/md";

/** Subdivision clamp mirrors `resample`'s own [1, 48] bound. */
const MIN_SUBDIVISIONS = 1;
const MAX_SUBDIVISIONS = 48;

export interface TrackConfigProps {
  label: string;
  /** Which hand this block configures — filters the Pattern (figuration) list. */
  hand: "bass" | "chord";
  pattern: RhythmPattern;
  onChange: (next: RhythmPattern) => void;
  /** The hand's tone-order figuration id (the *what*). */
  figurationId: string;
  onFigurationChange: (id: string) => void;
}

/**
 * One hand's controls, in two orthogonal axes:
 *  - **Pattern** (the tone-order / *what*): which figuration the hand plays,
 *    picked from `figurationsForHand(hand)`.
 *  - **Preset / rotation / subdivisions** (the rhythm-grid / *when*): the onset
 *    necklace. The preset picker snaps subdivisions to the preset's native
 *    length, the rotation stepper cyclically shifts, and the subdivision stepper
 *    proportionally adapts the pattern. The provenance label reads the preset name
 *    — throwing `findRhythm` is intentional: an unknown `presetId` is a bug, not a
 *    value to paper over — plus " (adapted)" once the subdivision count has drifted
 *    from the preset's native length.
 */
export function TrackConfig({
  label,
  hand,
  pattern,
  onChange,
  figurationId,
  onFigurationChange,
}: TrackConfigProps) {
  const preset = pattern.presetId ? findRhythm(pattern.presetId) : null;
  const adapted = preset != null && pattern.subdivisions !== preset.subdivisions;
  const provenance = preset ? `${preset.label}${adapted ? " (adapted)" : ""}` : "Custom";

  // base-ui resolves the collapsed trigger label from `items`, not the option list.
  const items: Record<string, string> = Object.fromEntries(
    RHYTHMS.map((r) => [r.id, r.label]),
  );

  const figurations = figurationsForHand(hand);
  const figurationItems: Record<string, string> = Object.fromEntries(
    figurations.map((f) => [f.id, f.label]),
  );

  return (
    <Stack gap="sm">
      <Stack direction="row" gap="sm" justify="between" align="center">
        <Text as="span" variant="body">
          {label}
        </Text>
        <Text as="span" variant="caption" tone="muted">
          {provenance}
        </Text>
      </Stack>

      <Stack gap="xs">
        <Text as="div" variant="caption" tone="muted">
          Pattern (which tones each onset strikes)
        </Text>
        <Select
          items={figurationItems}
          value={figurationId}
          onValueChange={(v: string | null) => {
            if (v) onFigurationChange(v);
          }}
        >
          <SelectTrigger aria-label={`${label} pattern`} className={cn("h-7 w-full text-caption")}>
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
      </Stack>

      <Stack gap="xs">
        <Text as="div" variant="caption" tone="muted">
          Preset (snaps subdivisions to its native length)
        </Text>
        <Select
          items={items}
          value={pattern.presetId ?? ""}
          onValueChange={(v: string | null) => {
            if (v) onChange(patternFromPreset(v));
          }}
        >
          <SelectTrigger aria-label={`${label} preset`} className={cn("h-7 w-full text-caption")}>
            <SelectValue placeholder="Custom" />
          </SelectTrigger>
          <SelectContent>
            {RHYTHMS.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Stack>

      <Stack direction="row" gap="sm" justify="between" align="center">
        <Text as="span" variant="caption" tone="muted">
          Rotation
        </Text>
        <Stack direction="row" gap="xs" align="center">
          <IconButton
            icon={MdRemove}
            label="Rotate left"
            onClick={() => onChange(rotate(pattern, -1))}
          />
          <Text as="span" variant="body" className="tabular-nums">
            {pattern.rotation}
          </Text>
          <IconButton
            icon={MdAdd}
            label="Rotate right"
            onClick={() => onChange(rotate(pattern, 1))}
          />
        </Stack>
      </Stack>

      <Stack gap="xs">
        <Stack direction="row" gap="sm" justify="between" align="center">
          <Text as="span" variant="caption" tone="muted">
            Subdivisions
          </Text>
          <Stack direction="row" gap="xs" align="center">
            <IconButton
              icon={MdRemove}
              label="Fewer subdivisions"
              disabled={pattern.subdivisions <= MIN_SUBDIVISIONS}
              onClick={() =>
                onChange(resample(pattern, Math.max(MIN_SUBDIVISIONS, pattern.subdivisions - 1)))
              }
            />
            <Text as="span" variant="body" className="tabular-nums">
              {pattern.subdivisions}
            </Text>
            <IconButton
              icon={MdAdd}
              label="More subdivisions"
              disabled={pattern.subdivisions >= MAX_SUBDIVISIONS}
              onClick={() =>
                onChange(resample(pattern, Math.min(MAX_SUBDIVISIONS, pattern.subdivisions + 1)))
              }
            />
          </Stack>
        </Stack>
        <Text as="div" variant="caption" tone="muted">
          Changing this adapts the pattern proportionally.
        </Text>
      </Stack>
    </Stack>
  );
}
