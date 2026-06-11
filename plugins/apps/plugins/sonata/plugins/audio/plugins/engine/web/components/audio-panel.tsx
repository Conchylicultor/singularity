import { cn } from "@/lib/utils";
import { Card } from "@plugins/primitives/plugins/card/web";
import { setAudioVolume, useAudioState } from "../audio-store";

/**
 * The visible "Audio" panel — a collapsible `Sonata.Section` (`area: "player"`)
 * showing the master-volume slider and the aggregate sample-load status.
 *
 * It owns NO audio: the Web Audio graph lives in the always-mounted
 * `AudioEngine` (`Sonata.Effect`). This panel only reads/writes the shared
 * `audio-store` — so collapsing it (which unmounts the panel) no longer touches
 * playback. The slider writes `volume`; the status line reflects the engine's
 * published `status` / `loadError`.
 */
export function AudioPanel() {
  const { volume, status, loadError } = useAudioState();

  return (
    <Card className="rounded-lg p-4">
      <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        Audio
      </div>

      {/* Master volume. */}
      <label className="mt-3 block">
        <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Volume
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setAudioVolume(Number(e.target.value))}
          className="mt-1 w-full accent-primary"
        />
      </label>

      {/* Aggregate sample-load status line. */}
      <div
        className={cn(
          "mt-3 text-caption",
          loadError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {loadError
          ? `Failed to load: ${loadError}`
          : status === "empty"
            ? "No instruments in use"
            : status === "ready"
              ? "Ready"
              : "Loading instrument…"}
      </div>
    </Card>
  );
}
