import { useMemo, useState, useSyncExternalStore } from "react";
import {
  chordKeyPlan,
  chordVoicing,
  songKeyLabel,
  songVocabulary,
  type SongKey,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import {
  RevealKeyboardCard,
  useReveal,
} from "@plugins/apps/plugins/chord/plugins/reveal/web";
import type {
  ChordToken,
  LoopCandidate,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  askedPositions,
  type Curriculum,
  type NextStep,
} from "@plugins/apps/plugins/chord/plugins/curriculum/core";
import {
  stepReadiness,
  useCurriculum,
  useNextStep,
  useUndoStep,
  useUnlockStep,
  type NextStepRead,
  type StepReadiness,
} from "@plugins/apps/plugins/chord/plugins/curriculum/web";
import {
  chordProgressResource,
  encodeProgressParams,
  recordRoundEndpoint,
  type ChordStanding,
} from "@plugins/apps/plugins/chord/plugins/progress/core";
import { reportPlaybackEndpoint } from "@plugins/apps/plugins/chord/plugins/video-availability/core";
import {
  YouTubePlayer,
  useYouTubePlayer,
  useYouTubePlayerState,
  type YouTubePlayerController,
} from "@plugins/integrations/plugins/youtube/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
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
import { useChordKeys } from "../internal/use-chord-keys";
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

/** One round's answers, tied to the loop they belong to. */
type RoundSession = {
  key: string;
  sheet: AnswerSheet;
  /** How many times each box was filled (a new fill replays its pop). */
  fills: readonly number[];
  /**
   * The last chord the learner asked to HEAR — a chord button after the check,
   * the "you: IV" tag, or a box replaying its stretch of the song. What the
   * reveal keyboard shows while nothing is sounding. It lives here, rather than
   * as its own state, because a session is already minted fresh per loop: the
   * next song clears it with everything else, and there is no reset to remember.
   */
  lastPlayed: ChordToken | null;
};

/**
 * The trainer: the song card with its player, the answer strip, the chord
 * buttons, and the progress panel beside them (below them under 1000px).
 * Flow and rules: `research/2026-09-18-apps-chord-trainer-app.md`, "How a
 * round works".
 *
 * Which chords play, and how much of a loop the learner names, come from the
 * curriculum. Until it has landed the screen shows a loading state: a palette
 * that is about to grow would be a claim about what this learner has.
 */
export function TrainerScreen() {
  const curriculum = useCurriculum();
  return (
    <Scroll className="chord-trainer @container h-full">
      <Inset x="lg" t="lg" b="xl" className="mx-auto max-w-[1280px]">
        {/* eslint-disable-next-line layout/no-adhoc-layout -- the page's two tracks: the main column and the 316px side panel, which drops below it when the pane is under 1000px wide. A container-query track template, which no layout primitive expresses. */}
        <div className="grid items-start gap-lg @[1000px]:grid-cols-[minmax(0,1fr)_316px]">
          {matchResource(curriculum, {
            pending: () => <Loading variant="block" />,
            ready: (c) => <TrainerBody curriculum={c} />,
          })}
        </div>
      </Inset>
    </Scroll>
  );
}

/** The two tracks of the page, once the curriculum is known. */
function TrainerBody({ curriculum }: { curriculum: Curriculum }) {
  const unlocked = useMemo(
    () => curriculum.unlocked.map((u) => u.token),
    [curriculum],
  );
  const progressParams = useMemo(
    () =>
      encodeProgressParams({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        tokens: unlocked,
      }),
    [unlocked],
  );
  const progress = useResource(chordProgressResource, progressParams);
  const queue = useLoopQueue({
    unlocked,
    modes: curriculum.modes,
    progress,
  });
  // Kept above the round, which unmounts when the queue runs dry.
  const session = useSessionMemory();

  const { read: nextStep } = useNextStep();
  const { unlock, pending: adding } = useUnlockStep();
  const undo = useUndoStep();

  // Three answers, not two: while the standing is on its way nobody can say
  // whether the learner is ready, and the Add controls show that rather than
  // claiming they are behind.
  const readiness = stepReadiness(unlocked, progress);
  // The learner's standings, or that they have not landed. The round needs the
  // target's answer count to know which boxes to ask about, so "not yet" has to
  // be a state it can render, not a zero that would ask the target alone.
  const standings: Standings = progress.pending
    ? { known: false }
    : { known: true, chords: progress.data.chords };

  const onAdd = useEventCallback((step: NextStep) => unlock(step));

  return (
    <>
      <Stack gap="md" className={yieldClass("x")}>
        <LoopArea
          queue={queue}
          memory={session}
          curriculum={curriculum}
          standings={standings}
          nextStep={nextStep}
          readiness={readiness}
          adding={adding}
          onAdd={onAdd}
        />
      </Stack>
      <ProgressPanel
        progress={progress}
        curriculum={curriculum}
        nextStep={nextStep}
        readiness={readiness}
        adding={adding}
        undoing={undo.pending}
        onAdd={onAdd}
        onUndo={undo.run}
      />
    </>
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

/**
 * The learner's per-chord standings, or that they have not landed yet. A union
 * rather than an empty list: "no answers yet" and "not read yet" would ask for
 * different boxes, so nothing downstream may confuse them.
 */
type Standings =
  { known: false } | { known: true; chords: readonly ChordStanding[] };

/** Everything the chord buttons and the round need from the curriculum. */
type LadderProps = {
  curriculum: Curriculum;
  standings: Standings;
  nextStep: NextStepRead;
  readiness: StepReadiness;
  adding: boolean;
  onAdd: (step: NextStep) => void;
};

/** Where the loop goes: the round, or why there is none yet. */
function LoopArea({
  queue,
  memory,
  ...ladder
}: {
  queue: LoopQueue;
  memory: SessionMemory;
} & LadderProps) {
  const { state } = queue;
  switch (state.kind) {
    case "ready":
      return (
        <Trainer
          loop={state.loop}
          target={state.target}
          queue={queue}
          memory={memory}
          {...ladder}
        />
      );
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
  target,
  queue,
  memory,
  curriculum,
  standings,
  nextStep,
  readiness,
  adding,
  onAdd,
}: {
  loop: LoopCandidate;
  /** The chord this loop was chosen for: the one the round asks about. */
  target: ChordToken;
  queue: LoopQueue;
  memory: SessionMemory;
} & LadderProps) {
  // How much of a chord is shown, and the words to say it with. One speller per
  // loop, shared by every box, button and lit key, so nothing on screen can
  // name a chord against a different key from its neighbour.
  const reveal = useReveal();
  const songKey = useMemo<SongKey>(
    () => ({ tonic: loop.window.keyTonic, mode: loop.window.keyMode }),
    [loop],
  );
  const words = useMemo(() => songVocabulary(songKey), [songKey]);
  const nameChord = reveal === "off" ? null : words.nameChord;

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

  // Which boxes the round asks about. A chord unlocked above the level the ask
  // rule was set at is asked alone until it has settled, so the rule needs how
  // many answers the target already has — until the standings land there is no
  // round to show yet, the same `null` the round itself uses.
  const asked = useMemo(() => {
    if (round === null || !standings.known) return null;
    const targetAnswers =
      standings.chords.find((c) => c.token === target)?.answers ?? 0;
    const unlockedTarget = curriculum.unlocked.find((u) => u.token === target);
    if (unlockedTarget === undefined) {
      throw new Error(
        `The round practises ${target}, which this learner has not unlocked`,
      );
    }
    return askedPositions(round.boxes, {
      windowBeats: round.grid.beats,
      askRule: curriculum.askRule,
      target,
      targetLevel: unlockedTarget.level,
      askRuleLevel: curriculum.askRuleLevel,
      targetAnswers,
    });
  }, [round, curriculum, target, standings]);

  const key = loopKey(loop);
  const [stored, setStored] = useState<RoundSession | null>(null);
  const session: RoundSession | null =
    round === null || asked === null
      ? null
      : stored?.key === key
        ? stored
        : {
            key,
            sheet: emptySheet(round, asked),
            fills: round.boxes.map(() => 0),
            lastPlayed: null,
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
      setStored({ ...session, lastPlayed: token });
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

  // The keys: the chord's digit, and a second key when several chords share it.
  const plan = useMemo(
    () => chordKeyPlan(curriculum.unlocked.map((u) => u.token)),
    [curriculum],
  );
  const keys = useChordKeys({ plan, onPick: pick });
  const { cancel } = keys;

  const togglePlay = useEventCallback(() => {
    cancel();
    if (!playerReady) return;
    memory.markInteracted();
    if (player.isPlaying) player.pause();
    else player.play();
  });

  const nextSong = useEventCallback(() => {
    cancel();
    memory.markInteracted();
    queue.next();
  });

  // A box replays that chord's stretch of the song, so that is the chord the
  // learner is now listening to.
  const onReplayBox = useEventCallback((box: Box) => {
    if (!playerReady) return;
    memory.markInteracted();
    player.playRange(box.startSec, box.endSec);
    if (session !== null) setStored({ ...session, lastPlayed: box.token });
  });

  const onHearAnswer = useEventCallback((answer: ChordToken) => {
    if (round === null) return;
    playOnPiano(chordVoicing(answer, round.keyTonicPc));
    if (session !== null) setStored({ ...session, lastPlayed: answer });
  });

  const onSelect = useEventCallback((position: number) =>
    updateSheet((s) => selectBox(s, position)),
  );
  const onMove = useEventCallback((delta: -1 | 1) => {
    cancel();
    updateSheet((s) => moveSelection(s, delta));
  });
  const onClear = useEventCallback(() => {
    cancel();
    updateSheet(clearBackward);
  });

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
      ...keys.shortcuts,
    ],
    [togglePlay, nextSong, onMove, onClear, keys.shortcuts],
  );
  useSurfaceShortcuts(shortcuts);

  // The ONE chord on show, fed to the lit button, the keyboard card and that
  // card's header, so the three can never disagree. The playhead wins while the
  // checked loop plays; otherwise it is the last chord the learner asked to
  // hear. Null before the check BY CONSTRUCTION — that is what stops the
  // keyboard giving the answer away, rather than a guard somewhere that could
  // be forgotten.
  const shownChord =
    !checked || round === null || session === null
      ? null
      : sounding === null
        ? session.lastPlayed
        : (round.boxes[sounding]?.token ?? null);

  const step =
    nextStep.kind === "answer" && nextStep.answer.kind === "step"
      ? nextStep.answer.step
      : null;

  return (
    <>
      <SongCard
        loop={loop}
        playing={playing}
        keyName={reveal === "off" ? null : songKeyLabel(songKey)}
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
          nameChord={nameChord}
          onSelect={onSelect}
          onReplayBox={onReplayBox}
          onHearAnswer={onHearAnswer}
        />
      )}
      <ChordButtons
        plan={plan}
        lit={shownChord}
        picking={keys.picking}
        nameChord={nameChord}
        nextStep={
          step === null
            ? null
            : {
                step,
                level: curriculum.level + 1,
                readiness,
                adding,
                onAdd: () => onAdd(step),
              }
        }
        onPick={pick}
      />
      {reveal === "keyboard" && round !== null && (
        <RevealKeyboardCard
          token={shownChord}
          songKey={songKey}
          tonicPc={round.keyTonicPc}
        />
      )}
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
