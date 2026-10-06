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
  EndpointError,
  getEndpointErrorMessage,
  useEndpointMutation,
} from "@plugins/infra/plugins/endpoints/web";
import { realignUg, setUgAlignmentVideo } from "../../core";
import {
  recordingState,
  recordingStateLine,
  recordingStateSummary,
  type RecordingState,
} from "../internal/recording-state";
import { useUgAlignment } from "../internal/use-ug-raw";

const PLACEHOLDER = "https://www.youtube.com/watch?v=…";

/** The state, for a section the `useAvailable` gate guarantees is a UG song. */
function useRecordingState(): { songId: string; state: RecordingState } {
  const { songId, raw, row } = useUgAlignment();
  if (raw === undefined || songId === null) {
    throw new Error(
      "The Recording section rendered without an open Ultimate Guitar song — its useAvailable gate should prevent this.",
    );
  }
  return { songId, state: recordingState(row, raw.tab) };
}

const TONE: Record<
  RecordingState["kind"],
  "muted" | "destructive" | "default"
> = {
  loading: "muted",
  unreadable: "destructive",
  "no-video": "muted",
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

/**
 * The song's recording (`Sonata.Section`, area `editor`): paste a YouTube link
 * to align the sheet to it, see where the alignment stands, and re-align. All
 * of it is derived from the live row (`recordingState`), so it follows a job
 * running in the background; applying the result to the Score is the
 * `UgAlignmentSync` effect's job, not this body's (it unmounts when collapsed).
 */
export function RecordingSection() {
  const { songId, state } = useRecordingState();
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

  const videoId = videoIdOf(state);
  const busy = state.kind === "queued" || state.kind === "aligning";
  const canRealign =
    videoId !== null &&
    !busy &&
    !(state.kind === "failed" && state.permanent === false);

  return (
    <Stack gap="md">
      {state.kind === "loading" ? (
        <Loading variant="text" />
      ) : (
        <Stack gap="2xs">
          {videoId !== null ? (
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noreferrer"
              className="text-body text-primary underline-offset-2 hover:underline"
            >
              youtube.com/watch?v={videoId}
            </a>
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

      {canRealign ? (
        <Inline gap="xs">
          <Button variant="ghost" onClick={realignNow}>
            Re-align
          </Button>
        </Inline>
      ) : null}

      {error !== null ? (
        <Text variant="caption" tone="destructive" role="alert">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
