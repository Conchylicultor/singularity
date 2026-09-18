import { useMemo, useState, useSyncExternalStore } from "react";
import {
  STARTING_CHORDS,
  STARTING_MODES,
  chordShortcutKey,
  chordVoicing,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import type {
  ChordToken,
  LoopCandidate,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  chordProgressResource,
  encodeProgressParams,
  recordRoundEndpoint,
} from "@plugins/apps/plugins/chord/plugins/progress/core";
import { reportPlaybackEndpoint } from "@plugins/apps/plugins/chord/plugins/video-availability/core";
import {
  YouTubePlayer,
  useYouTubePlayer,
  useYouTubePlayerState,
  type YouTubePlayerController,
} from "@plugins/integrations/plugins/youtube/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { yieldClass } from "@plugins/primitives/plugins/css/plugins/yield/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import {
  boxAt,
  clearBackward,
  emptySheet,
  fillSelected,
  moveSelection,
  recordRoundBody,
  roundFromCandidate,
  selectBox,
  type AnswerSheet,
  type Box,
  type Round,
} from "../../core";
import { useHeardClock } from "../internal/use-heard-clock";
import {
  loopKey,
  useLoopQueue,
  type LoopQueue,
} from "../internal/use-loop-queue";
import { usePiano } from "../internal/use-piano";
import { AnswerStrip } from "./answer-strip";
import { ChordButtons } from "./chord-buttons";
import { ProgressPanel } from "./progress-panel";
import { SongCard } from "./song-card";
import "./trainer.css";

/** The chords the trainer asks for, until the curriculum decides. */
const UNLOCKED = STARTING_CHORDS;

/** One round's answers, tied to the loop they belong to. */
type RoundSession = {
  key: string;
  sheet: AnswerSheet;
  /** How many times each box was filled (a new fill replays its pop). */
  fills: readonly number[];
};

/**
 * The trainer: the song card with its player, the answer strip, the chord
 * buttons, and the progress panel beside them (below them under 1000px).
 * Flow and rules: `research/2026-09-18-apps-chord-trainer-app.md`, "How a
 * round works".
 */
export function TrainerScreen() {
  const progressParams = useMemo(
    () =>
      encodeProgressParams({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        tokens: [...UNLOCKED],
      }),
    [],
  );
  const progress = useResource(chordProgressResource, progressParams);
  const queue = useLoopQueue({
    unlocked: UNLOCKED,
    modes: STARTING_MODES,
    progress,
  });
  // Kept above the round, which unmounts when the queue runs dry.
  const session = useSessionMemory();

  return (
    <Scroll className="chord-trainer @container h-full">
      <Inset x="lg" t="lg" b="xl" className="mx-auto max-w-[1280px]">
        {/* eslint-disable-next-line layout/no-adhoc-layout -- the page's two tracks: the main column and the 316px side panel, which drops below it when the pane is under 1000px wide. A container-query track template, which no layout primitive expresses. */}
        <div className="grid items-start gap-lg @[1000px]:grid-cols-[minmax(0,1fr)_316px]">
          <Stack gap="md" className={yieldClass("x")}>
            <LoopArea queue={queue} memory={session} />
          </Stack>
          <ProgressPanel progress={progress} chords={UNLOCKED} />
        </div>
      </Inset>
    </Scroll>
  );
}

/**
 * What the trainer remembers for the whole visit: whether the page has been
 * used (browsers block sound until it has, so the first loop waits for Play
 * and every loop after a Play or a Next starts by itself), and which videos
 * have been reported playing.
 */
type SessionMemory = {
  interacted: boolean;
  markInteracted: () => void;
  /** Videos reported `playing` this visit: each is reported once. */
  reportedPlaying: Set<string>;
};

function useSessionMemory(): SessionMemory {
  const [interacted, setInteracted] = useState(false);
  const [reportedPlaying] = useState(() => new Set<string>());
  return useMemo(
    () => ({
      interacted,
      markInteracted: () => setInteracted(true),
      reportedPlaying,
    }),
    [interacted, reportedPlaying],
  );
}

/** Where the loop goes: the round, or why there is none yet. */
function LoopArea({
  queue,
  memory,
}: {
  queue: LoopQueue;
  memory: SessionMemory;
}) {
  const { state } = queue;
  switch (state.kind) {
    case "ready":
      return <Trainer loop={state.loop} queue={queue} memory={memory} />;
    case "loading":
      return <Loading variant="block" />;
    case "empty":
      return (
        <Notice
          title="No song fits these chords yet"
          detail="Every loop is made only of the chords you have. None is left to play right now."
          onRetry={queue.retry}
        />
      );
    case "not-ready":
      return (
        <Notice
          title="The songs are not ready"
          detail={`The song index answered “${state.status.kind}”.`}
          onRetry={queue.retry}
        />
      );
    case "error":
      return (
        <Notice
          title="The next songs could not be found"
          detail={state.message}
          onRetry={queue.retry}
        />
      );
  }
}

function Notice({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry: () => void;
}) {
  return (
    <Card className="rounded-2xl">
      <Stack gap="sm" align="start">
        <Text variant="heading" className="font-bold">
          {title}
        </Text>
        <Text variant="body" tone="muted" className="break-words">
          {detail}
        </Text>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </Stack>
    </Card>
  );
}

/**
 * The round on screen. The player lives here and stays mounted from loop to
 * loop (a new video loads in place), so after the first Play every loop starts
 * by itself.
 */
function Trainer({
  loop,
  queue,
  memory,
}: {
  loop: LoopCandidate;
  queue: LoopQueue;
  memory: SessionMemory;
}) {
  const player = useYouTubePlayer();
  const playerState = useYouTubePlayerState(player);
  const playerReady = playerState.kind === "ready";
  const playing = playerState.kind === "ready" && playerState.playing;
  const piano = usePiano();

  // The video's length from the player, for a video-fraction alignment only
  // (a beat-times round never reads it, so it is not rebuilt when it lands).
  const [playerDuration, setPlayerDuration] = useState<{
    videoId: string;
    seconds: number;
  } | null>(null);
  const durationForRound =
    loop.alignment.kind === "video-fraction" &&
    playerDuration?.videoId === loop.videoId
      ? playerDuration.seconds
      : null;
  const roundResult = useMemo(
    () => roundFromCandidate(loop, { videoDurationSeconds: durationForRound }),
    [loop, durationForRound],
  );
  const round = roundResult.kind === "round" ? roundResult.round : null;

  const key = loopKey(loop);
  const [stored, setStored] = useState<RoundSession | null>(null);
  const session: RoundSession | null =
    round === null
      ? null
      : stored?.key === key
        ? stored
        : {
            key,
            sheet: emptySheet(round.boxes.length),
            fills: round.boxes.map(() => 0),
          };
  const checked = session?.sheet.checked ?? false;

  const heardAt = useHeardClock(player, round);
  const sounding = useSoundingBox(player, round, checked);

  const record = useEndpointMutation(recordRoundEndpoint);
  const report = useEndpointMutation(reportPlaybackEndpoint);

  const updateSheet = (fn: (sheet: AnswerSheet) => AnswerSheet) => {
    if (session === null || round === null) return;
    const sheet = fn(session.sheet);
    if (sheet === session.sheet) return;
    setStored({ ...session, sheet });
  };

  const playOnPiano = (pitches: readonly number[]) => {
    void piano(pitches).catch((err: unknown) => {
      showToast({
        title: "The piano could not play",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
      throw err;
    });
  };

  const pick = useEventCallback((token: ChordToken) => {
    if (session === null || round === null) return;
    if (session.sheet.checked) {
      playOnPiano(chordVoicing(token, round.keyTonicPc));
      return;
    }
    const at = session.sheet.selected;
    if (at === null) return;
    const heard = heardAt(at);
    const sheet = fillSelected(
      session.sheet,
      token,
      heard === null ? 0 : performance.now() - heard,
    );
    const fills = session.fills.map((n, i) => (i === at ? n + 1 : n));
    setStored({ ...session, sheet, fills });
    // The last fill checks the round: saved once, in one call.
    if (sheet.checked) record.mutate({ body: recordRoundBody(sheet, round) });
  });

  const togglePlay = useEventCallback(() => {
    if (!playerReady) return;
    memory.markInteracted();
    if (player.isPlaying) player.pause();
    else player.play();
  });

  const nextSong = useEventCallback(() => {
    memory.markInteracted();
    queue.next();
  });

  const onReplayBox = useEventCallback((box: Box) => {
    if (!playerReady) return;
    memory.markInteracted();
    player.playRange(box.startSec, box.endSec);
  });

  const onHearAnswer = useEventCallback((answer: ChordToken) => {
    if (round !== null) playOnPiano(chordVoicing(answer, round.keyTonicPc));
  });

  const onSelect = useEventCallback((position: number) =>
    updateSheet((s) => selectBox(s, position)),
  );
  const onMove = useEventCallback((delta: -1 | 1) =>
    updateSheet((s) => moveSelection(s, delta)),
  );
  const onClear = useEventCallback(() => updateSheet(clearBackward));

  // The first time a video plays this session it is reported playing; a
  // player error is reported with its code, and the trainer moves on.
  const onPlaying = useEventCallback(() => {
    if (memory.reportedPlaying.has(loop.videoId)) return;
    memory.reportedPlaying.add(loop.videoId);
    report.mutate({
      params: { videoId: loop.videoId },
      body: { outcome: "playing" },
    });
  });
  const onError = useEventCallback((code: number) => {
    report.mutate({
      params: { videoId: loop.videoId },
      body: { outcome: "error", code },
    });
    showToast({
      description: "This video can't play here — next song",
    });
    queue.skipVideo(loop.videoId);
  });
  const onReady = useEventCallback((seconds: number) =>
    setPlayerDuration({ videoId: loop.videoId, seconds }),
  );

  const shortcuts = useMemo(
    () => [
      {
        id: "chord.play-pause",
        keys: "space",
        label: "Play / pause",
        group: "Chord",
        handler: togglePlay,
      },
      {
        id: "chord.next-song",
        keys: "enter",
        label: "Next song",
        group: "Chord",
        handler: nextSong,
      },
      {
        id: "chord.previous-box",
        keys: "arrowleft",
        label: "Previous box",
        group: "Chord",
        handler: () => onMove(-1),
      },
      {
        id: "chord.next-box",
        keys: "arrowright",
        label: "Next box",
        group: "Chord",
        handler: () => onMove(1),
      },
      {
        id: "chord.clear-box",
        keys: "backspace",
        label: "Clear the box",
        group: "Chord",
        handler: onClear,
      },
      ...UNLOCKED.flatMap((token) => {
        const digit = chordShortcutKey(token);
        return digit === null
          ? []
          : [
              {
                id: `chord.pick-${digit}`,
                keys: digit,
                label: `Answer degree ${digit}`,
                group: "Chord",
                handler: () => pick(token),
              },
            ];
      }),
    ],
    [togglePlay, nextSong, onMove, onClear, pick],
  );
  useSurfaceShortcuts(shortcuts);

  const litToken =
    checked && round !== null && sounding !== null
      ? (round.boxes[sounding]?.token ?? null)
      : null;

  return (
    <>
      <SongCard
        loop={loop}
        playing={playing}
        canPlay={playerReady}
        checked={checked}
        onTogglePlay={togglePlay}
        onNext={nextSong}
        player={
          <YouTubePlayer
            controller={player}
            videoId={loop.videoId}
            loop={
              round === null
                ? null
                : { start: round.loop.startSec, end: round.loop.endSec }
            }
            autoplay={memory.interacted}
            onReady={onReady}
            onPlaying={onPlaying}
            onError={onError}
          />
        }
      />
      {round === null || session === null ? (
        <Loading variant="block" />
      ) : (
        <AnswerStrip
          round={round}
          sheet={session.sheet}
          fills={session.fills}
          player={player}
          playerReady={playerReady}
          soundingPosition={sounding}
          onSelect={onSelect}
          onReplayBox={onReplayBox}
          onHearAnswer={onHearAnswer}
        />
      )}
      <ChordButtons chords={UNLOCKED} lit={litToken} onPick={pick} />
    </>
  );
}

const noSubscription = () => () => {};

/**
 * The position of the box sounding now, re-rendering only when it changes
 * (not every frame). Watched only while `active` (once the round is checked:
 * before, nothing on screen shows it).
 */
function useSoundingBox(
  player: YouTubePlayerController,
  round: Round | null,
  active: boolean,
): number | null {
  const watching = active && round !== null;
  return useSyncExternalStore(
    watching ? player.subscribePlayhead : noSubscription,
    () => {
      if (!watching) return null;
      const t = player.getPlayhead();
      return t === null ? null : (boxAt(round.boxes, t)?.position ?? null);
    },
  );
}
