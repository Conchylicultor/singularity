import { useEffect, useRef, useState } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  YouTubePlayerControllerImpl,
  type YouTubePlayerCallbacks,
  type YouTubeAudio,
  type YouTubePlayerController,
  type YouTubeRange,
} from "../internal/controller";
import { loadYouTubeIframeApi } from "../internal/iframe-api";

export interface YouTubePlayerProps extends YouTubePlayerCallbacks {
  /** From `useYouTubePlayer()`; one controller binds to one mounted player. */
  controller: YouTubePlayerController;
  videoId: string;
  /**
   * The stretch to repeat, in seconds, or `null` to play straight through.
   * Changing it on the same video moves the loop without reloading.
   */
  loop: YouTubeRange | null;
  /**
   * Start each newly loaded video by itself (browsers allow this once the page
   * has been interacted with). Otherwise a new video is cued at the loop start
   * and waits for `controller.play()`. Read when a video loads.
   */
  autoplay?: boolean;
  /**
   * The volume (0–100) and mute to hold the player at, on this video and every
   * one loaded after. Muting does not pause: the video keeps playing silently.
   * Omitted leaves the audio as YouTube has it.
   */
  audio?: YouTubeAudio;
  className?: string;
}

/**
 * An embedded YouTube player bound to `controller`. The iframe fills this
 * element; giving it a size (a 16:9 box) is the caller's job.
 *
 * The player is created once per mount and reused across `videoId` changes
 * (loaded or cued in place), and destroyed on unmount. A failure to load the
 * IFrame API script is thrown during render, to the nearest error boundary.
 */
export function YouTubePlayer({
  controller,
  videoId,
  loop,
  autoplay = false,
  audio,
  className,
  onReady,
  onPlaying,
  onError,
  onStateChange,
}: YouTubePlayerProps) {
  const impl = asImpl(controller);
  const hostRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const callbacks = useLatestRef<YouTubePlayerCallbacks>({
    onReady,
    onPlaying,
    onError,
    onStateChange,
  });

  const loopStart = loop?.start ?? null;
  const loopEnd = loop?.end ?? null;
  const volume = audio?.volume ?? null;
  const muted = audio?.muted ?? null;
  useEffect(() => {
    impl.setSource({
      videoId,
      loop:
        loopStart === null || loopEnd === null
          ? null
          : { start: loopStart, end: loopEnd },
      autoplay,
      audio: volume === null || muted === null ? null : { volume, muted },
    });
  }, [impl, videoId, loopStart, loopEnd, autoplay, volume, muted]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) throw new Error("YouTubePlayer: host element missing");
    impl.setCallbacks(() => callbacks.current);
    // The API replaces the element it is given with its iframe, so it gets a
    // node React does not own.
    const mount = document.createElement("div");
    host.appendChild(mount);
    let cancelled = false;
    void loadYouTubeIframeApi().then(
      (yt) => {
        if (!cancelled) impl.attach(yt, mount);
      },
      (err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err : new Error(String(err)));
        }
      },
    );
    return () => {
      cancelled = true;
      impl.detach();
      host.replaceChildren();
    };
  }, [impl, callbacks]);

  if (loadError !== null) throw loadError;

  return <div ref={hostRef} className={cn("size-full", className)} />;
}

function asImpl(
  controller: YouTubePlayerController,
): YouTubePlayerControllerImpl {
  if (!(controller instanceof YouTubePlayerControllerImpl)) {
    throw new Error(
      "YouTubePlayer: controller must come from useYouTubePlayer()",
    );
  }
  return controller;
}
