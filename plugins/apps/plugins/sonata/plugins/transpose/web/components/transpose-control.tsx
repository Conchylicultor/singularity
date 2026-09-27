import { MdAdd, MdRemove, MdSwapVert } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  transposeSetting,
  useSongSetting,
  useSonata,
  useWriteSongSetting,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { scoreEndBeat } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { ToolbarControl } from "@plugins/apps/plugins/sonata/plugins/primitives/plugins/toolbar-control/web";
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
 * The transpose control pinned into the Sonata player pane's header
 * (`sonataPlayerPane.Actions`),
 * beside the speed wheel: a compact `[ ⇅ − ±N st + ]` semitone stepper. Like
 * `transport-bar`'s controls it owns no score state — it reads the loaded song's
 * `transposeSetting` + the open song from `useSonata`, writes the setting
 * optimistically for instant re-render, and persists via `saveTranspose`. The whole control dims
 * when there is no song (no score span), mirroring `PlaybackControls`' `hasScore`
 * gate. The live transposed key is already shown by the key chip/readout, so this
 * stays focused on the semitone delta.
 *
 * Until the open song's offset is known the stepper is a loading placeholder:
 * a step needs a known base, and a `0` shown meanwhile would be a claim about
 * the song.
 */
export function TransposeControl() {
  const transpose = useSongSetting(transposeSetting);
  const { score } = useSonata();
  const hasScore = scoreEndBeat(score) > 0;

  return (
    <ToolbarControl
      icon={<MdSwapVert className="size-3.5" />}
      tooltip="Transpose — shift the whole song by semitones"
      disabled={transpose.pending || !hasScore}
    >
      {transpose.pending ? (
        <Inset x="sm">
          <Loading variant="block" className="h-4 w-20" />
        </Inset>
      ) : (
        <TransposeStepper semitones={transpose.value} disabled={!hasScore} />
      )}
    </ToolbarControl>
  );
}

/** The stepper's three segments over a KNOWN offset. */
function TransposeStepper({
  semitones,
  disabled,
}: {
  semitones: number;
  disabled: boolean;
}) {
  const setStore = useWriteSongSetting(transposeSetting);
  const { currentSongId } = useSonata();

  // Write the loaded song's setting optimistically (instant re-render of every
  // lens + audio), then persist for this song. Clamp to the octave range.
  const setTranspose = (next: number) => {
    if (currentSongId === null) return;
    const clamped = Math.max(MIN_SEMITONES, Math.min(MAX_SEMITONES, next));
    setStore(currentSongId, clamped);
    saveTranspose(currentSongId, clamped);
  };

  return (
    <>
      <IconButton
        icon={MdRemove}
        label="Transpose down a semitone"
        disabled={disabled || semitones <= MIN_SEMITONES}
        onClick={() => setTranspose(semitones - 1)}
      />
      {/* Center readout; clicking resets to the original key (interactive only
          when transposed). */}
      <button
        type="button"
        disabled={semitones === 0}
        aria-label={
          semitones === 0 ? "Transpose (no shift)" : "Reset transpose"
        }
        title={semitones === 0 ? undefined : "Reset to original key"}
        onClick={() => setTranspose(0)}
        className="min-w-[3rem] border-x border-border px-xs text-center"
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
        disabled={disabled || semitones >= MAX_SEMITONES}
        onClick={() => setTranspose(semitones + 1)}
      />
    </>
  );
}
