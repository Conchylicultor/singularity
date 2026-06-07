import {
  MdRestartAlt,
  MdVisibility,
  MdVisibilityOff,
  MdVolumeOff,
  MdVolumeUp,
} from "react-icons/md";
import { cn } from "@/lib/utils";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { SwatchGrid } from "@plugins/primitives/plugins/color-picker/web";
import {
  setTrackColor,
  setTrackHidden,
  setTrackMuted,
  resetTrackViews,
} from "../actions";
import { useTrackMixerEntries, type TrackMixerEntry } from "../hooks";
import { TRACK_PALETTE } from "../palette";

/** Round swatch that opens a categorical palette picker for one track. */
function ColorSwatch({
  songId,
  trackId,
  color,
}: {
  songId: string;
  trackId: string;
  color: string;
}) {
  return (
    <InlinePopover
      tooltip="Track color"
      contentClassName="w-auto p-2"
      trigger={
        <button
          type="button"
          aria-label="Track color"
          className="size-4 shrink-0 rounded-full border border-border/60 transition-transform hover:scale-110"
          style={{ background: color }}
        />
      }
    >
      <SwatchGrid
        colors={[...TRACK_PALETTE]}
        value={color}
        onChange={(c) => setTrackColor(songId, trackId, c)}
      />
    </InlinePopover>
  );
}

function TrackRow({
  songId,
  entry,
}: {
  songId: string;
  entry: TrackMixerEntry;
}) {
  const { trackId, name, instrument, noteCount, color, muted, hidden } = entry;
  return (
    <div className="flex items-center gap-2 py-1">
      <ColorSwatch songId={songId} trackId={trackId} color={color} />

      <div className={cn("min-w-0 flex-1", hidden && "opacity-50")}>
        <div className="truncate text-xs font-medium text-foreground">
          {name}
        </div>
        <div className="truncate text-3xs text-muted-foreground">
          {instrument ? `${instrument} · ` : ""}
          {noteCount} {noteCount === 1 ? "note" : "notes"}
        </div>
      </div>

      <IconButton
        icon={muted ? MdVolumeOff : MdVolumeUp}
        label={muted ? "Unmute track" : "Mute track"}
        aria-pressed={muted}
        size="icon-sm"
        className={cn(muted && "text-destructive")}
        onClick={() => setTrackMuted(songId, trackId, !muted)}
      />
      <IconButton
        icon={hidden ? MdVisibilityOff : MdVisibility}
        label={hidden ? "Show track" : "Hide track"}
        aria-pressed={hidden}
        size="icon-sm"
        className={cn(hidden && "text-muted-foreground")}
        onClick={() => setTrackHidden(songId, trackId, !hidden)}
      />
    </div>
  );
}

/**
 * The "Tracks" section panel (`Sonata.Section`, area "player"). Lists every
 * track of the open song with a compact, toggle-icon control set: categorical
 * color, mute (audio), and hide (piano-roll), plus name / instrument / note
 * count and a per-song reset. State persists per (song, track).
 */
export function TrackMixerPanel() {
  const { currentSongId } = useSonata();
  const entries = useTrackMixerEntries();

  if (!currentSongId || entries.length === 0) return null;

  const anyCustomized = entries.some((e) => e.customized);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tracks
        </div>
        <IconButton
          icon={MdRestartAlt}
          label="Reset tracks to defaults"
          size="icon-sm"
          disabled={!anyCustomized}
          onClick={() => resetTrackViews(currentSongId)}
        />
      </div>

      <div className="mt-2 divide-y divide-border/60">
        {entries.map((entry) => (
          <TrackRow key={entry.trackId} songId={currentSongId} entry={entry} />
        ))}
      </div>
    </div>
  );
}
