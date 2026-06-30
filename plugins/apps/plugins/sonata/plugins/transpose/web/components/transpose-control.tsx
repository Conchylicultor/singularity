import { MdAdd, MdRemove, MdSwapVert } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import {
  useSetTransposeSemitones,
  useSonata,
  useTransposeSemitones,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { scoreEndBeat } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { saveTranspose } from "../actions";

/** Transpose bounds — a full octave each way (matches the endpoint clamp). */
const MIN_SEMITONES = -12;
const MAX_SEMITONES = 12;

/** Signed readout: `0`, `+N`, or `−N` (true minus glyph). */
function formatOffset(semitones: number): string {
  if (semitones === 0) return "0";
  return semitones > 0 ? `+${semitones}` : `−${Math.abs(semitones)}`;
}

/**
 * The transpose control pinned into the Sonata top toolbar (`SonataToolbar.End`),
 * beside the speed wheel: a compact `[ ⇅ − ±N st + ]` semitone stepper. Like
 * `transport-bar`'s controls it owns no score state — it reads the per-surface
 * transpose store + the open song from `useSonata`, writes the store optimistically
 * for instant re-render, and persists via `saveTranspose`. The whole control dims
 * when there is no song (no score span), mirroring `PlaybackControls`' `hasScore`
 * gate. The live transposed key is already shown by the key chip/readout, so this
 * stays focused on the semitone delta.
 */
export function TransposeControl() {
  const semitones = useTransposeSemitones();
  const setStore = useSetTransposeSemitones();
  const { currentSongId, score } = useSonata();

  const hasScore = scoreEndBeat(score) > 0;

  // Write the per-surface store optimistically (instant re-render of every lens +
  // audio), then persist for this song. Clamp to the octave range.
  const setTranspose = (next: number) => {
    const clamped = Math.max(MIN_SEMITONES, Math.min(MAX_SEMITONES, next));
    setStore(clamped);
    if (currentSongId) saveTranspose(currentSongId, clamped);
  };

  return (
    <WithTooltip content="Transpose — shift the whole song by semitones">
      <Stack
        direction="row"
        align="center"
        gap="none"
        className={cn(
          "rounded-md border border-border",
          !hasScore && "pointer-events-none opacity-40",
        )}
      >
        <MdSwapVert className="ml-2xs size-3.5 text-muted-foreground" />
        <IconButton
          icon={MdRemove}
          label="Transpose down a semitone"
          disabled={!hasScore || semitones <= MIN_SEMITONES}
          onClick={() => setTranspose(semitones - 1)}
        />
        {/* Center readout; clicking resets to the original key (interactive only
            when transposed). */}
        <button
          type="button"
          disabled={semitones === 0}
          aria-label={semitones === 0 ? "Transpose (no shift)" : "Reset transpose"}
          title={semitones === 0 ? undefined : "Reset to original key"}
          onClick={() => setTranspose(0)}
          className="min-w-[3rem] border-x border-border px-xs text-center enabled:cursor-pointer disabled:cursor-default"
        >
          <Text
            as="span"
            variant="caption"
            className={cn(
              "font-medium tabular-nums",
              semitones === 0 && "text-muted-foreground opacity-40",
            )}
          >
            {formatOffset(semitones)}
            <span className="ml-2xs text-muted-foreground">st</span>
          </Text>
        </button>
        <IconButton
          icon={MdAdd}
          label="Transpose up a semitone"
          disabled={!hasScore || semitones >= MAX_SEMITONES}
          onClick={() => setTranspose(semitones + 1)}
        />
      </Stack>
    </WithTooltip>
  );
}
