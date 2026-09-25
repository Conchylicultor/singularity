import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  chordKeyPlan,
  chordSound,
  songKeyLabel,
  songKeyTonicPc,
  songVocabulary,
  type SongKey,
} from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import {
  PianoCard,
  usePiano,
  useSoundMix,
} from "@plugins/apps/plugins/chord/plugins/piano/web";
import { MAX_VOLUME } from "@plugins/apps/plugins/chord/plugins/piano/core";
import type {
  ChordToken,
  LoopCandidate,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  PATH_TOKENS,
  askedPositions,
  playableChords,
  practisedChords,
  type Blanks,
  type Selection,
} from "@plugins/apps/plugins/chord/plugins/curriculum/core";
import { useCurriculum } from "@plugins/apps/plugins/chord/plugins/curriculum/web";
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
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import {
  useEventCallback,
  useLatestRef,
} from "@plugins/primitives/plugins/latest-ref/web";
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
import { usePianoFollow } from "../internal/use-piano-follow";
import {
  loopKey,
  useLoopQueue,
  type LoopQueue,
} from "../internal/use-loop-queue";
import { AnswerStrip } from "./answer-strip";
import { ChordButtons } from "./chord-buttons";
import { ProgressPanel } from "./progress-panel";
import { SongCard } from "./song-card";
import "./trainer.css";

/** One round's answers, tied to the loop they belong to. */
type RoundSession = {
  /** The loop and the boxes it asks: a change of blanks or chords re-deals the round. */
  key: string;
  sheet: AnswerSheet;
  /** The blanks setting the asked boxes were chosen by: saved with the round. */
  blanks: Blanks;
  /** How many times each box was filled (a new fill replays its pop). */
  fills: readonly number[];
  /**
   * The last chord HEARD — a chord button after the check, a wrong box's struck answer,
   * a box replaying itself, or the playhead crossing into a box while the
   * checked loop runs. The one chord the piano draws.
   *
   * Every way of sounding a chord writes here, which is what lets a chord
   * clicked DURING playback light the keyboard: the click is simply more recent
   * than the box behind it, and it stays on show until the song reaches the
   * next chord. It lives on the session, rather than as its own state, because
   * a session is already minted fresh per loop: the next song clears it with
   * everything else, and there is no reset to remember.
   */
  lastPlayed: ChordToken | null;
};

/**
 * The trainer: the song card with its player, the answer strip, the chord
 * buttons, and the progress panel beside them (below them under 1000px).
 * Flow and rules: `research/2026-09-18-apps-chord-trainer-app.md`, "How a
 * round works".
 *
 * Which chords play, which are asked, and how much of a loop is blank come
 * from the learner's selection (curriculum). Until it has landed the screen
 * shows a loading state: buttons that are about to change would be a claim
 * about what this learner has chosen.
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
            ready: (c) => <TrainerBody selection={c} />,
          })}
        </div>
      </Inset>
    </Scroll>
  );
}

/** The two tracks of the page, once the selection is known. */
function TrainerBody({ selection }: { selection: Selection }) {
  const unlocked = useMemo(() => playableChords(selection), [selection]);
  const practised = useMemo(() => practisedChords(selection), [selection]);
  // Every chord on, and every chord the path names: the panel's rows read the
  // first, the path's map the second.
  const progressParams = useMemo(
    () =>
      encodeProgressParams({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        tokens: [...unlocked, ...PATH_TOKENS],
      }),
    [unlocked],
  );
  const progress = useResource(chordProgressResource, progressParams);
  const queue = useLoopQueue({
    unlocked,
    practised,
    modes: selection.modes,
    progress,
  });
  // Kept above the round, which unmounts when the queue runs dry.
  const session = useSessionMemory();

  return (
    <>
      <Stack gap="md" className={yieldClass("x")}>
        <LoopArea queue={queue} memory={session} selection={selection} />
      </Stack>
      <ProgressPanel progress={progress} selection={selection} />
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

/** Where the loop goes: the round, or why there is none yet. */
function LoopArea({
  queue,
  memory,
  selection,
}: {
  queue: LoopQueue;
  memory: SessionMemory;
  selection: Selection;
}) {
  const { state } = queue;
  switch (state.kind) {
    case "ready":
      return (
        <Trainer
          loop={state.loop}
          target={state.target}
          queue={queue}
          memory={memory}
          selection={selection}
        />
      );
    case "loading":
      return <Loading variant="block" />;
    case "empty":
      return (
        <Notice
          title="No song fits these chords yet"
          detail="Every loop is made only of the chords you have on. None is left to play right now — turn more chords on, or practise one you only hear."
          onRetry={queue.retry}
        />
      );
    case "nothing-practised":
      return (
        <Card className="rounded-2xl">
          <Stack gap="sm" align="start">
            <Text variant="heading" className="font-bold">
              No chord is practised
            </Text>
            <Text variant="body" tone="muted" className="break-words">
              Set at least one chord to Practise in the Path card: those are the
              chords you name.
            </Text>
          </Stack>
        </Card>
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
  selection,
}: {
  loop: LoopCandidate;
  /** The chord this loop was chosen for: the one the round asks about. */
  target: ChordToken;
  queue: LoopQueue;
  memory: SessionMemory;
  selection: Selection;
}) {
  // The words to say a chord with. One speller per loop, shared by every box,
  // button and lit key, so nothing on screen can name a chord against a
  // different key from its neighbour — and one tonic under it, so nothing
  // sounds a chord built on a different one.
  const songKey = useMemo<SongKey>(
    () => ({ tonic: loop.window.keyTonic, mode: loop.window.keyMode }),
    [loop],
  );
  const words = useMemo(() => songVocabulary(songKey), [songKey]);
  const tonicPc = useMemo(() => songKeyTonicPc(songKey), [songKey]);
  // What the loop is heard with: the song (muted, never paused, when off) and
  // the piano following it, each at its own level.
  const mix = useSoundMix();

  const player = useYouTubePlayer();
  const playerState = useYouTubePlayerState(player);
  const playerReady = playerState.kind === "ready";
  const playing = playerState.kind === "ready" && playerState.playing;
  const piano = usePiano(mix.piano.volume / MAX_VOLUME);

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

  // Which boxes the round asks about: the practised chords' boxes, narrowed
  // by the blanks setting. The queue drops a loop whose target is no longer
  // practised, so the target here always is.
  const practised = useMemo(
    () => new Set(practisedChords(selection)),
    [selection],
  );
  const asked = useMemo(
    () =>
      round === null
        ? null
        : askedPositions(round.boxes, {
            windowBeats: round.grid.beats,
            blanks: selection.blanks,
            practised,
            target,
          }),
    [round, selection.blanks, practised, target],
  );

  // A change of blanks or chords asks different boxes: the round starts over.
  const key = `${loopKey(loop)}|${asked?.join(",") ?? ""}`;
  const [stored, setStored] = useState<RoundSession | null>(null);
  const session: RoundSession | null =
    round === null || asked === null
      ? null
      : stored?.key === key
        ? stored
        : {
            key,
            sheet: emptySheet(round, asked),
            blanks: selection.blanks,
            fills: round.boxes.map(() => 0),
            lastPlayed: null,
          };
  const checked = session?.sheet.checked ?? false;

  const heardAt = useHeardClock(player, round);
  const sounding = useSoundingBox(player, round, checked);

  // The playhead crossing into a box is a chord sounding, so it is recorded
  // like every other way of sounding one. That is the whole rule behind "the
  // piano shows what you are hearing": there is one memory, and the most recent
  // writer wins — a click during playback holds the keyboard until the song
  // reaches the next chord, and then the song takes it back.
  //
  // The session is read through a ref because it is DERIVED (a fresh object
  // until the first write of a loop), so depending on it would re-run this
  // effect on renders where nothing sounded.
  const sessionRef = useLatestRef(session);
  useEffect(() => {
    if (round === null || sounding === null) return;
    const token = round.boxes[sounding]?.token ?? null;
    const current = sessionRef.current;
    if (token === null || current === null) return;
    if (current.lastPlayed === token) return;
    setStored({ ...current, lastPlayed: token });
  }, [round, sounding, sessionRef]);

  const record = useEndpointMutation(recordRoundEndpoint);
  const report = useEndpointMutation(reportPlaybackEndpoint);

  const updateSheet = (fn: (sheet: AnswerSheet) => AnswerSheet) => {
    if (session === null || round === null) return;
    const sheet = fn(session.sheet);
    if (sheet === session.sheet) return;
    setStored({ ...session, sheet });
  };

  // The two ways the screen sounds something, both through the one piano: a
  // set of notes (a key the learner pressed) and a chord (its whole sound,
  // doubled bass included — `chordSound` is the same call the keyboard lights).
  const playNotes = useEventCallback(
    (pitches: readonly number[], ringSeconds?: number) => {
      void piano.play(pitches, { ringSeconds }).catch((err: unknown) => {
        showToast({
          title: "The piano could not play",
          description: err instanceof Error ? err.message : String(err),
          variant: "error",
        });
        throw err;
      });
    },
  );
  const playChord = useEventCallback(
    (token: ChordToken, ringSeconds?: number) =>
      playNotes(chordSound(token, tonicPc).pitches, ringSeconds),
  );

  // With the piano on, it plays along with the song: each box's chord struck
  // as the playhead enters it, held for the rest of the box. It sounds before
  // the check too — hearing the bare chords is the point — but writes nothing
  // the keyboard reads, so it gives no answer away.
  usePianoFollow({
    player,
    round,
    enabled: mix.piano.on,
    strike: (box, remaining) => playChord(box.token, remaining),
    silence: piano.silence,
  });

  const pick = useEventCallback((token: ChordToken) => {
    if (session === null || round === null) return;
    if (session.sheet.checked) {
      // Always the piano, whatever the sound toggle says: this chord need not
      // be in the loop at all, so there may be no song to play it with.
      playChord(token);
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
    if (sheet.checked) {
      record.mutate({ body: recordRoundBody(sheet, round, session.blanks) });
    }
  });

  // One button per practised chord — the only chords a blank can hold. The
  // keys: the chord's digit, and a second key when several chords share it.
  const plan = useMemo(() => chordKeyPlan([...practised]), [practised]);
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

  // A box plays its bars of the song, heard through whichever channels are on
  // — the record, the piano following it, or both. It is the chord the learner
  // is now listening to, so the keyboard shows it.
  const onReplayBox = useEventCallback((box: Box) => {
    memory.markInteracted();
    if (session !== null) setStored({ ...session, lastPlayed: box.token });
    player.playRange(box.startSec, box.endSec);
  });

  // The answer the learner gave, which the song never played: the piano only.
  const onHearAnswer = useEventCallback((answer: ChordToken) => {
    playChord(answer);
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

  // The ONE chord on show, fed to the lit button, the piano and its header, so
  // the three can never disagree: the last chord heard, whatever sounded it.
  // Null before the check BY CONSTRUCTION — nothing writes `lastPlayed` until
  // the round is checked — which is what stops the keyboard giving the answer
  // away, rather than a guard somewhere that could be forgotten.
  const shownChord = !checked || session === null ? null : session.lastPlayed;

  return (
    <>
      <SongCard
        loop={loop}
        playing={playing}
        keyName={songKeyLabel(songKey)}
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
            audio={{ volume: mix.song.volume, muted: !mix.song.on }}
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
          canReplay={playerReady}
          soundingPosition={sounding}
          nameChord={words.nameChord}
          onSelect={onSelect}
          onReplayBox={onReplayBox}
          onHearAnswer={onHearAnswer}
        />
      )}
      <ChordButtons
        plan={plan}
        lit={shownChord}
        picking={keys.picking}
        nameChord={words.nameChord}
        onPick={pick}
      />
      <PianoCard
        token={shownChord}
        songKey={songKey}
        tonicPc={tonicPc}
        play={playNotes}
      />
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
