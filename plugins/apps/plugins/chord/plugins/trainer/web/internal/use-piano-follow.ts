import { useEffect, useRef } from "react";
import type { YouTubePlayerController } from "@plugins/integrations/plugins/youtube/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { boxAt, type Box, type Round } from "../../core";

/**
 * How far back the playhead must jump to count as the song starting a box
 * again (the loop wrapping, a box replayed) rather than the time jittering.
 */
const JUMP_BACK_SECONDS = 0.25;

/**
 * The piano playing along with the song: while `enabled`, every time the
 * song's playhead enters a box — moving on to the next one, wrapping to the
 * loop's start, or a box replayed from its start — `strike` is called with that
 * box and the seconds it still has to run. When the song stops playing,
 * `silence` is called, so the piano never outlasts the record it follows.
 *
 * The song is the clock, muted or not: this only watches its playhead, so a
 * muted video keeps the piano in time exactly as an audible one does. The
 * playhead is read once per animation frame (the player's own subscription),
 * so a chord lands within a frame of its box.
 */
export function usePianoFollow({
  player,
  round,
  enabled,
  strike,
  silence,
}: {
  player: YouTubePlayerController;
  round: Round | null;
  enabled: boolean;
  strike: (box: Box, remainingSeconds: number) => void;
  silence: () => void;
}): void {
  const onStrike = useEventCallback(strike);
  const onSilence = useEventCallback(silence);
  /** The box last struck and the time it was read at; null = strike the next box reached. */
  const lastRef = useRef<{ position: number | null; t: number } | null>(null);

  useEffect(() => {
    if (!enabled || round === null) return;
    lastRef.current = null;
    const onPlayhead = () => {
      const t = player.getPlayhead();
      if (t === null) return;
      const box = boxAt(round.boxes, t);
      const last = lastRef.current;
      const jumpedBack = last !== null && t < last.t - JUMP_BACK_SECONDS;
      const moved = last === null || last.position !== (box?.position ?? null);
      lastRef.current = { position: box?.position ?? null, t };
      if (box !== null && (moved || jumpedBack)) {
        onStrike(box, Math.max(0, box.endSec - t));
      }
    };
    // Paused, buffering or gone: the piano stops with the song, and the box
    // under the playhead is struck again when it resumes.
    let wasPlaying = player.isPlaying;
    const onState = () => {
      const playing = player.isPlaying;
      if (wasPlaying && !playing) {
        lastRef.current = null;
        onSilence();
      }
      wasPlaying = playing;
    };
    const offPlayhead = player.subscribePlayhead(onPlayhead);
    const offState = player.subscribe(onState);
    return () => {
      offPlayhead();
      offState();
      onSilence();
    };
  }, [player, round, enabled, onStrike, onSilence]);
}
