import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useSession } from "@plugins/apps/plugins/sonata/plugins/session/web";
import { scoreEndBeat } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const pauseIcon = symbol("pause");
const playArrowIcon = symbol("play-arrow");

/**
 * Play / pause at the head of the player's transport strip
 * (`SonataPlayer.Transport`). It drives the shared transport's `togglePlay` —
 * the deliberate-play path, with the metronome's count-in lead-in — the same
 * verb as the Space key, so button and keyboard always agree.
 *
 * A pending count-in reads as playing: the button shows Pause and a click
 * cancels the lead-in (`togglePlay` stops it). Nothing to play until a source
 * has loaded a score with span, and a frozen 0% speed cannot play either.
 */
export function PlayButton() {
  const { isPlaying, countIn, togglePlay, tempoScale, score } = useSession();
  const active = isPlaying || countIn !== null;
  const canPlay = scoreEndBeat(score) > 0 && tempoScale > 0;
  return (
    <IconButton
      icon={active ? pauseIcon : playArrowIcon}
      label={active ? "Pause" : "Play"}
      shortcut="space"
      disabled={!active && !canPlay}
      onClick={togglePlay}
    />
  );
}
