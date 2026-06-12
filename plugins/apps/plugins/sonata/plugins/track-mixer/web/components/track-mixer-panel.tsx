import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useMemo, useState, type ComponentType } from "react";
import { Card } from "@plugins/primitives/plugins/card/web";
import {
  MdAutoMode,
  MdCheck,
  MdExpandMore,
  MdRestartAlt,
  MdVisibility,
  MdVisibilityOff,
  MdVolumeOff,
  MdVolumeUp,
} from "react-icons/md";
import { Sonata, useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Row, SectionHeaderRow } from "@plugins/primitives/plugins/row/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import {
  SearchInput,
  useTextFilter,
} from "@plugins/primitives/plugins/search/web";
import { SwatchGrid } from "@plugins/primitives/plugins/color-picker/web";
import {
  setTrackColor,
  setTrackHidden,
  setTrackInstrument,
  setTrackMuted,
  resetTrackViews,
} from "../actions";
import { useTrackMixerEntries, type TrackMixerEntry } from "../hooks";
import { TRACK_PALETTE } from "../palette";

type IconType = ComponentType<{ className?: string }>;

/** The instrument-contribution metadata the picker reads (never `createVoices`). */
interface InstrumentOption {
  id: string;
  label: string;
  icon?: IconType;
  group?: string;
}

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

/**
 * Functional per-track instrument picker. The trigger shows the resolved
 * instrument's label (+ icon); the popover offers a searchable list of every
 * registered timbre grouped by its `group`, plus a "Reset to auto" entry that
 * clears the override back to the GM-derived / default timbre. Selecting writes
 * the override (or clears it) and closes the popover. Active option is checked.
 */
function InstrumentPicker({
  songId,
  trackId,
  options,
  resolvedId,
  resolvedLabel,
  customized,
}: {
  songId: string;
  trackId: string;
  options: InstrumentOption[];
  resolvedId: string;
  resolvedLabel: string;
  customized: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { query, setQuery, filtered } = useTextFilter({
    items: options,
    accessor: (o) => `${o.label} ${o.group ?? ""}`,
  });

  // Group the (filtered) options by their `group` label, preserving the
  // contribution order both within and across groups.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, InstrumentOption[]>();
    for (const o of filtered) {
      const g = o.group ?? "Other";
      if (!byGroup.has(g)) {
        byGroup.set(g, []);
        order.push(g);
      }
      byGroup.get(g)!.push(o);
    }
    return order.map((g) => ({ group: g, options: byGroup.get(g)! }));
  }, [filtered]);

  const ResolvedIcon = options.find((o) => o.id === resolvedId)?.icon;

  const select = (id: string | null) => {
    setTrackInstrument(songId, trackId, id);
    setOpen(false);
  };

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      tooltip="Track instrument"
      contentClassName="w-60 p-2"
      trigger={
        <button
          type="button"
          aria-label="Track instrument"
          className="flex min-w-0 items-center gap-1 rounded-md text-3xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {ResolvedIcon ? <ResolvedIcon className="size-3 shrink-0" /> : null}
          <span className="truncate">{resolvedLabel}</span>
          <MdExpandMore className="size-3 shrink-0" />
        </button>
      }
    >
      <SearchInput
        autoFocus
        placeholder="Search instruments…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="mt-2 max-h-64 overflow-y-auto">
        {/* Reset-to-auto: clears the override so resolution falls back to the
            track's GM program / the default timbre. Active when no override. */}
        <Row
          size="sm"
          hover="muted"
          selected={!customized}
          icon={<MdAutoMode className="shrink-0" />}
          actions={
            !customized ? <MdCheck className="size-3.5 text-primary" /> : undefined
          }
          actionsAlwaysVisible
          onClick={() => select(null)}
        >
          <span className="truncate">Auto</span>
        </Row>

        {groups.map(({ group, options: groupOptions }) => (
          <div key={group} className="mt-1">
            <div className="px-2 py-1 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </div>
            {groupOptions.map((o) => {
              const Icon = o.icon;
              const active = customized && o.id === resolvedId;
              return (
                <Row
                  key={o.id}
                  size="sm"
                  hover="muted"
                  selected={active}
                  icon={
                    Icon ? (
                      <Icon className="size-3.5 shrink-0" />
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )
                  }
                  actions={
                    active ? (
                      <MdCheck className="size-3.5 text-primary" />
                    ) : undefined
                  }
                  actionsAlwaysVisible
                  onClick={() => select(o.id)}
                >
                  <span className="truncate">{o.label}</span>
                </Row>
              );
            })}
          </div>
        ))}
      </div>
    </InlinePopover>
  );
}

function TrackRow({
  songId,
  options,
  entry,
}: {
  songId: string;
  options: InstrumentOption[];
  entry: TrackMixerEntry;
}) {
  const {
    trackId,
    name,
    noteCount,
    color,
    muted,
    hidden,
    instrumentId,
    instrumentLabel,
    customized,
  } = entry;
  return (
    <div className="flex items-center gap-2 py-1">
      <ColorSwatch songId={songId} trackId={trackId} color={color} />

      <div className={cn("min-w-0 flex-1", hidden && "opacity-50")}>
        <Text as="div" variant="caption" className="truncate font-medium text-foreground">
          {name}
        </Text>
        <div className="flex items-center gap-1 text-3xs text-muted-foreground">
          <InstrumentPicker
            songId={songId}
            trackId={trackId}
            options={options}
            resolvedId={instrumentId}
            resolvedLabel={instrumentLabel}
            customized={customized}
          />
          <span className="shrink-0">
            · {noteCount} {noteCount === 1 ? "note" : "notes"}
          </span>
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
 * color, mute (audio), and hide (piano-roll), a functional per-track instrument
 * picker, plus name / note count and a per-song reset. State persists per
 * (song, track).
 */
export function TrackMixerPanel() {
  const { currentSongId } = useSonata();
  const entries = useTrackMixerEntries();

  // Registered timbres, read generically (never names a contributor). Mapped to
  // the plain metadata the picker renders; `createVoices` stays in the engine.
  const instruments = Sonata.Instrument.useContributions();
  const options = useMemo<InstrumentOption[]>(
    () =>
      instruments.map((c) => ({
        id: c.id,
        label: c.label,
        icon: c.icon,
        group: c.group,
      })),
    [instruments],
  );

  if (!currentSongId || entries.length === 0) return null;

  const anyCustomized = entries.some((e) => e.customized);

  return (
    <Card className="rounded-lg p-4">
      <Collapsible defaultOpen>
        <SectionHeaderRow
          variant="eyebrow"
          actions={
            <IconButton
              icon={MdRestartAlt}
              label="Reset tracks to defaults"
              size="icon-sm"
              disabled={!anyCustomized}
              onClick={() => resetTrackViews(currentSongId)}
            />
          }
        >
          Tracks
        </SectionHeaderRow>

        <CollapsibleContent className="mt-2 divide-y divide-border/60">
          {entries.map((entry) => (
            <TrackRow
              key={entry.trackId}
              songId={currentSongId}
              options={options}
              entry={entry}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
