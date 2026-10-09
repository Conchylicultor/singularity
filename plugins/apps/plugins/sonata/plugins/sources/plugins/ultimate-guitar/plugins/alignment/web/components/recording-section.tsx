import { useState } from "react";
import {
  Button,
  Input,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plugins/primitives/plugins/collapsible/web";
import {
  EndpointError,
  getEndpointErrorMessage,
  useEndpointMutation,
} from "@plugins/infra/plugins/endpoints/web";
import {
  realignUg,
  resolveUgAlignment,
  setUgAlignmentVideo,
  type AlignmentCandidate,
  type CandidateOutcome,
  type UgAlignmentRow,
} from "../../core";
import {
  recordingState,
  recordingStateLine,
  recordingStateSummary,
  type RecordingState,
} from "../internal/recording-state";
import { useUgAlignment } from "../internal/use-ug-raw";
import { RecordingVideo } from "@plugins/apps/plugins/sonata/plugins/recording/web";

const PLACEHOLDER = "https://www.youtube.com/watch?v=…";

/** The state, for a section the `useAvailable` gate guarantees is a UG song. */
function useRecordingState(): {
  songId: string;
  state: RecordingState;
  /** The row once read (null: the song has none yet); the candidates and the pick live there. */
  row: UgAlignmentRow | null;
  /**
   * The video to show: the one the applied alignment is for (what the score
   * plays on — a weak match or the resolver's best try included), else the
   * row's chosen video, which plays unsynced until it has an alignment.
   */
  shownVideoId: string | null;
} {
  const { songId, raw, row } = useUgAlignment();
  if (raw === undefined || songId === null) {
    throw new Error(
      "The Recording section rendered without an open Ultimate Guitar song — its useAvailable gate should prevent this.",
    );
  }
  const found = row.status === "ready" && row.found ? row.row : null;
  return {
    songId,
    state: recordingState(row, raw.tab),
    row: found,
    shownVideoId: raw.alignment?.videoId ?? found?.videoId ?? null,
  };
}

const TONE: Record<
  RecordingState["kind"],
  "muted" | "destructive" | "default"
> = {
  loading: "muted",
  unreadable: "destructive",
  "no-video": "muted",
  finding: "muted",
  "needs-video": "destructive",
  queued: "muted",
  aligning: "muted",
  aligned: "default",
  weak: "destructive",
  failed: "destructive",
  "out-of-date": "muted",
};

/** Collapsed-state preview: the same status line as the body. */
export function RecordingSummary() {
  const { state } = useRecordingState();
  return (
    <Text variant="caption" tone={TONE[state.kind]}>
      {recordingStateSummary(state)}
    </Text>
  );
}

function videoIdOf(state: RecordingState): string | null {
  switch (state.kind) {
    case "loading":
    case "unreadable":
    case "no-video":
    case "finding":
    case "needs-video":
      return null;
    case "queued":
    case "aligning":
    case "aligned":
    case "weak":
    case "failed":
    case "out-of-date":
      return state.videoId;
  }
}

const OUTCOME_LABEL: Record<CandidateOutcome, string> = {
  untried: "Not tried",
  trying: "Trying…",
  aligned: "Aligned",
  weak: "Weak match",
  failed: "Failed",
  "not-embeddable": "Can't be embedded",
};

const candidateName = (c: AlignmentCandidate) => c.title ?? c.videoId;

/**
 * The resolver's candidates, best first, behind a disclosure: each one's
 * outcome and score, and a click switches the song to it (the same call as
 * pasting its link — the user's pick from then on).
 */
function CandidateList({
  candidates,
  current,
  onPick,
}: {
  candidates: readonly AlignmentCandidate[];
  current: string | null;
  onPick: (videoId: string) => void;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="gap-xs text-caption text-muted-foreground hover:text-foreground">
        <CollapsibleChevron />
        <span>Candidate videos ({candidates.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Stack gap="2xs" className="pt-xs">
          {/* A few videos inside one row's jsonb, shown for picking — not a
              collection of records to search, sort or group. */}
          {candidates.map((c) => (
            <button
              key={c.videoId}
              type="button"
              onClick={() => onPick(c.videoId)}
              disabled={c.videoId === current}
              className="rounded-sm px-xs py-2xs text-left hover:bg-muted disabled:cursor-default disabled:bg-muted/60"
              title={`Use ${candidateName(c)}`}
            >
              <Stack gap="none">
                <Text variant="body">{candidateName(c)}</Text>
                <Text variant="caption" tone="muted">
                  {[
                    c.channel,
                    OUTCOME_LABEL[c.outcome],
                    c.score === null ? null : `${Math.round(c.score * 100)}%`,
                    c.error,
                    c.sources.join(" + "),
                  ]
                    .filter((part) => part !== null && part !== "")
                    .join(" · ")}
                </Text>
              </Stack>
            </button>
          ))}
        </Stack>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The song's recording (`Sonata.Section`, area `editor`): the video itself
 * (`RecordingVideo` — synced to the transport when the score plays on it, else
 * playing on its own), then where the alignment stands, the link field and
 * re-align. All of it is derived from the live row (`recordingState`), so it
 * follows a job running in the background; applying the result to the Score is
 * the `UgAlignmentSync` effect's job, not this body's (it unmounts when
 * collapsed — and with it the video, so playback falls back to the synth).
 */
export function RecordingSection() {
  const { songId, state, row, shownVideoId } = useRecordingState();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Errors are shown inline next to the field they came from (a bad link is a
  // 400), so the global toast is suppressed.
  const setVideo = useEndpointMutation(setUgAlignmentVideo, {
    meta: { suppressError: true },
  });
  const realign = useEndpointMutation(realignUg, {
    meta: { suppressError: true },
  });
  const resolve = useEndpointMutation(resolveUgAlignment, {
    meta: { suppressError: true },
  });

  async function run(action: () => Promise<unknown>): Promise<void> {
    setError(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof EndpointError) {
        setError(getEndpointErrorMessage(err));
        return;
      }
      throw err;
    }
  }

  const align = () =>
    run(async () => {
      await setVideo.mutateAsync({
        params: { id: songId },
        body: { url: url.trim() },
      });
      setUrl("");
    });
  const realignNow = () =>
    run(() => realign.mutateAsync({ params: { id: songId } }));
  const findVideo = () =>
    run(() => resolve.mutateAsync({ params: { id: songId } }));
  const pick = (candidateId: string) =>
    run(() =>
      setVideo.mutateAsync({
        params: { id: songId },
        body: { url: candidateId },
      }),
    );

  const videoId = videoIdOf(state);
  const busy =
    state.kind === "queued" ||
    state.kind === "aligning" ||
    state.kind === "finding";
  const chosen =
    videoId === null
      ? null
      : (row?.candidates.find((c) => c.videoId === videoId) ?? null);
  const canFind = videoId === null && !busy && state.kind !== "loading";
  const canRealign =
    videoId !== null &&
    !busy &&
    !(state.kind === "failed" && state.permanent === false);

  return (
    <Stack gap="md">
      {shownVideoId !== null ? <RecordingVideo videoId={shownVideoId} /> : null}

      {state.kind === "loading" ? (
        <Loading variant="text" />
      ) : (
        <Stack gap="2xs">
          {videoId !== null ? (
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noreferrer"
              className="text-body text-primary-text underline-offset-2 hover:underline"
            >
              {chosen?.title ?? `youtube.com/watch?v=${videoId}`}
            </a>
          ) : null}
          {videoId !== null && row !== null ? (
            <Text variant="caption" tone="muted">
              {[
                chosen?.channel ?? null,
                row.pick === "auto" ? "picked automatically" : "set by you",
              ]
                .filter((part) => part !== null)
                .join(" · ")}
            </Text>
          ) : null}
          <Text
            variant="caption"
            tone={TONE[state.kind]}
            role={state.kind === "failed" ? "alert" : undefined}
          >
            {recordingStateLine(state)}
          </Text>
          {state.kind === "failed" && !state.permanent ? (
            <Inline gap="xs">
              <Button variant="outline" onClick={realignNow}>
                Retry
              </Button>
            </Inline>
          ) : null}
        </Stack>
      )}

      <Stack gap="xs">
        <Text variant="eyebrow" tone="muted">
          YouTube recording
        </Text>
        <Inline gap="sm">
          <Fill>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim().length > 0) {
                  e.preventDefault();
                  void align();
                }
              }}
              placeholder={PLACEHOLDER}
              spellCheck={false}
            />
          </Fill>
          <Button onClick={align} disabled={url.trim().length === 0}>
            Align
          </Button>
        </Inline>
      </Stack>

      {canRealign || canFind ? (
        <Inline gap="xs">
          {canFind ? (
            <Button variant="outline" onClick={findVideo}>
              Find a video
            </Button>
          ) : null}
          {canRealign ? (
            <Button variant="ghost" onClick={realignNow}>
              Re-align
            </Button>
          ) : null}
        </Inline>
      ) : null}

      {row !== null && row.candidates.length > 0 ? (
        <CandidateList
          candidates={row.candidates}
          current={videoId}
          onPick={(id) => void pick(id)}
        />
      ) : null}

      {error !== null ? (
        <Text variant="caption" tone="destructive" role="alert">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
