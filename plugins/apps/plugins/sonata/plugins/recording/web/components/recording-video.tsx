import { useEffect } from "react";
import { useSession } from "@plugins/apps/plugins/sonata/plugins/session/web";
import {
  YouTubePlayer,
  useYouTubePlayer,
  useYouTubePlayerState,
  type YouTubePlayerState,
} from "@plugins/integrations/plugins/youtube/web";
import { statusFromPlayerCode } from "@plugins/integrations/plugins/youtube/core";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Slider } from "@plugins/primitives/plugins/css/plugins/slider/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { recordingConfig } from "../../shared/config";
import { createVideoDriver } from "../driver";
import { RefusalProvider, type MediaRefusal } from "../refusal";
import { SonataRecording } from "../slots";

const volumeOffIcon = symbol("volume-off");
const volumeDownIcon = symbol("volume-down");
const volumeUpIcon = symbol("volume-up");

/** What a player error says, for the video it was showing. */
type PlayerFault =
  /** YouTube refused the video: it is gone, or not embeddable. Reported to whoever chose it. */
  | { kind: "refused"; refusal: MediaRefusal }
  /** The player failed for a reason that says nothing about the video (an invalid parameter, an HTML5 fault). Shown, never reported. */
  | { kind: "player"; code: number };

function faultOf(
  state: YouTubePlayerState,
  videoId: string,
): PlayerFault | null {
  if (state.kind !== "error" || state.videoId !== videoId) return null;
  const verdict = statusFromPlayerCode(state.code);
  if (verdict.kind === "decided" && verdict.status !== "ok") {
    return {
      kind: "refused",
      refusal: {
        provider: "youtube",
        videoId,
        status: verdict.status,
        code: state.code,
      },
    };
  }
  return { kind: "player", code: state.code };
}

/**
 * A song's recording, for whoever shows it (the UG alignment's Recording
 * section): the YouTube video (16:9) and its volume (on/off, slider, level)
 * right below it. The sync offset is not in the card: it is the
 * `sonata.recording` config's `syncOffsetMs` (Settings → Config), still applied
 * to the driver.
 *
 * It drives the transport exactly when the open score is timed on this video
 * (`score.meta.recording.videoId === videoId`): while the player is ready it is
 * registered as the session's transport driver, so the cursor, the synth and
 * the loop follow it, and YouTube's own controls are off (the transport is the
 * app's). Otherwise the video is NOT synced: it plays on its own with YouTube's
 * controls, the synth keeps the score's own timing, and a "Not synced" badge
 * sits over the video's top-left corner. Switching between the two re-creates
 * the player (its controls are fixed at creation).
 *
 * Unmounting (the section collapsed, the player closed) unregisters the driver
 * and the iframe dies with it; playback carries on with the synth alone on the
 * same timing, from where the video was.
 */
export function RecordingVideo({ videoId }: { videoId: string }) {
  const { score } = useSession();
  const synced = score.meta.recording?.videoId === videoId;
  return (
    <Stack gap="xs">
      <VideoPlayer
        key={synced ? "synced" : "free"}
        videoId={videoId}
        synced={synced}
      />
      <VideoVolume />
    </Stack>
  );
}

function VideoPlayer({
  videoId,
  synced,
}: {
  videoId: string;
  synced: boolean;
}) {
  const { registerTransportDriver } = useSession();
  const { videoOn, videoVolume, syncOffsetMs } = useConfig(recordingConfig);
  const offsetSecRef = useLatestRef(syncOffsetMs / 1000);

  const controller = useYouTubePlayer();
  const state = useYouTubePlayerState(controller);
  const ready = state.kind === "ready" && state.videoId === videoId;

  useEffect(() => {
    if (!synced || !ready) return;
    return registerTransportDriver(
      createVideoDriver(controller, () => offsetSecRef.current),
    );
  }, [synced, ready, controller, registerTransportDriver, offsetSecRef]);

  const fault = faultOf(state, videoId);

  return (
    <Stack gap="xs">
      <Clip className="relative aspect-video w-full rounded-md bg-muted">
        <YouTubePlayer
          controller={controller}
          videoId={videoId}
          loop={null}
          controls={!synced}
          audio={{ volume: videoVolume, muted: !videoOn }}
        />
        {!synced && <NotSyncedBadge />}
      </Clip>
      {fault?.kind === "refused" && (
        <>
          <Text variant="caption" tone="destructive" role="alert">
            {fault.refusal.status === "gone"
              ? "This video is no longer on YouTube."
              : "YouTube does not allow this video to play here."}{" "}
            The synth plays on its own.
          </Text>
          <RefusalProvider key={videoId} refusal={fault.refusal}>
            <SonataRecording.Refused.Mount />
          </RefusalProvider>
        </>
      )}
      {fault?.kind === "player" && (
        <Text variant="caption" tone="destructive" role="alert">
          The video player failed (YouTube error {fault.code}). The synth plays
          on its own; reopen the song to try the video again.
        </Text>
      )}
    </Stack>
  );
}

/**
 * Over the video's top-left corner while it plays on its own (the synth keeps
 * the sheet's own timing): a dot and "Not synced" on a translucent dark pill —
 * the video behind is dark whatever the theme. Clicks pass through to
 * YouTube's controls.
 */
function NotSyncedBadge() {
  return (
    <Pin to="top-left" offset="sm" decorative>
      <Line className="gap-xs rounded-full bg-black/60 px-sm py-2xs text-white backdrop-blur-sm">
        <span className={`${rigidClass()} size-1.5 rounded-full bg-white/50`} />
        <Text variant="caption">Not synced</Text>
      </Line>
    </Pin>
  );
}

/** The video's sound: on/off and its level (`sonata.recording`). Muting keeps it playing, so it still keeps time. */
function VideoVolume() {
  const { videoOn, videoVolume } = useConfig(recordingConfig);
  const setConfig = useSetConfig(recordingConfig);
  const silent = !videoOn || videoVolume === 0;
  return (
    <Line className="gap-xs">
      <IconButton
        icon={
          silent
            ? volumeOffIcon
            : videoVolume < 50
              ? volumeDownIcon
              : volumeUpIcon
        }
        label={videoOn ? "Mute the video" : "Unmute the video"}
        onClick={() => setConfig("videoOn", !videoOn)}
      />
      <Fill>
        <Slider
          value={videoVolume}
          min={0}
          max={100}
          step={1}
          onValueChange={(v) => {
            setConfig("videoVolume", v);
            if (!videoOn) setConfig("videoOn", true);
          }}
          aria-label="Video volume"
          className="w-full"
        />
      </Fill>
      <Text
        variant="caption"
        tone="muted"
        className={`${rigidClass()} w-6 text-right tabular-nums`}
      >
        {videoVolume}
      </Text>
    </Line>
  );
}
