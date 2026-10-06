import { useMemo } from "react";
import {
  TEMPO_MATH_FLOOR,
  useCursorSelector,
  useSession,
} from "@plugins/apps/plugins/sonata/plugins/session/web";
import {
  buildTempoIndex,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { formatElapsed } from "@plugins/primitives/plugins/relative-time/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { SonataPlayer } from "../slots";
import { usePlayerView } from "../view";
import { NoDisplay } from "./no-display";

const pauseIcon = symbol("pause");
const playArrowIcon = symbol("play-arrow");

/**
 * The display lens over the session's score — `displayId`, else the player
 * view's lens — dispatched through `SonataPlayer.Display` inside a `Clip` that
 * fills its parent. Renders the no-display fallback when no lens is
 * contributed.
 */
export function PlayerDisplay({ displayId }: { displayId?: string }) {
  const { score, tempoScale } = useSession();
  const view = usePlayerView();
  const active = displayId ?? view.displayId;
  return (
    <Clip fill>
      {active === null ? (
        <NoDisplay />
      ) : (
        <SonataPlayer.Display.Dispatch
          score={score}
          // Displays scale geometry by this to cancel the scale folded into
          // `score`; floor it so a frozen 0% (which scales `score` by the
          // same floor) cancels to a finite layout instead of NaN.
          tempoScale={Math.max(tempoScale, TEMPO_MATH_FLOOR)}
          activeDisplayId={active}
        />
      )}
    </Clip>
  );
}

/**
 * The transport strip — every `SonataPlayer.Transport` contribution (the
 * progress scrubber with its markers). Renders nothing with no contributor.
 */
export function PlayerTransport() {
  return (
    <SonataPlayer.Transport.Render>
      {(t) => <t.component key={t.id} />}
    </SonataPlayer.Transport.Render>
  );
}

/**
 * Play / pause from the live cursor — a plain toggle, with no count-in (the
 * deliberate-play path with the metronome lead-in is the transport bar's).
 */
export function PlayToggle() {
  const { isPlaying, play, stop } = useSession();
  return (
    <IconButton
      icon={isPlaying ? pauseIcon : playArrowIcon}
      label={isPlaying ? "Pause" : "Play"}
      onClick={() => (isPlaying ? stop() : play())}
    />
  );
}

/**
 * The playhead's time and the song's duration (`m:ss / m:ss`), in real
 * seconds at the current tempo — the session's score has the tempo scale
 * folded in, so at 50% speed both stretch to match. Re-renders once per
 * second of playback, never per frame; the lead-in pre-roll reads `0:00`.
 */
export function PlayerTime() {
  const { score } = useSession();
  const tempo = useMemo(() => buildTempoIndex(score), [score]);
  const endBeat = scoreEndBeat(score);
  const elapsedSec = useCursorSelector(
    (beat) => Math.max(0, Math.floor(tempo.beatToSeconds(beat))),
    [tempo],
  );
  const totalSec = endBeat > 0 ? tempo.beatToSeconds(endBeat) : 0;
  return (
    <Text variant="caption" tone="muted" className="tabular-nums">
      {formatElapsed(elapsedSec * 1000)} / {formatElapsed(totalSec * 1000)}
    </Text>
  );
}
