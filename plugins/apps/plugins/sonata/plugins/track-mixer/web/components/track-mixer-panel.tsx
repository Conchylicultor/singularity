import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, useState, type ComponentType } from "react";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
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
import { Row, SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import {
  SearchInput,
  useTextFilter,
} from "@plugins/primitives/plugins/search/web";
import { SwatchGrid } from "@plugins/primitives/plugins/css/plugins/color-picker/web";
import {
  setTrackColor,
  setTrackHidden,
  setTrackInstrument,
  setTrackMuted,
  resetTrackViews,
} from "../actions";
import { useTrackMixerEntries, type TrackMixerEntry } from "../hooks";
import { TRACK_PALETTE, blackKeyColor } from "../palette";

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
      contentClassName="w-auto p-sm"
      trigger={
        <button
          type="button"
          aria-label="Track color"
          className="size-4 rounded-full border border-border/60 transition-transform hover:scale-110"
          style={{ background: blackKeyColor(color) }}
        />
      }
    >
      <SwatchGrid
        colors={[...TRACK_PALETTE]}
        value={color}
        renderColor={blackKeyColor}
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
      contentClassName="w-60 p-sm"
      trigger={
        <button
          type="button"
          aria-label="Track instrument"
          // eslint-disable-next-line layout/no-adhoc-layout -- flexible leaf of TrackRow's instrument+notes Stack (button is the interaction wrapper; Frame inside owns the icon|label|chevron shrink hierarchy)
          className="min-w-0 rounded-md text-3xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Frame
            gap="xs"
            leading={ResolvedIcon ? <ResolvedIcon className="size-3" /> : undefined}
            content={resolvedLabel}
            trailing={<MdExpandMore className="size-3" />}
          />
        </button>
      }
    >
      <SearchInput
        autoFocus
        placeholder="Search instruments…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt offsets the scroll list below the search input (no named margin utility) */}
      <Scroll className="mt-2 max-h-64">
        {/* Reset-to-auto: clears the override so resolution falls back to the
            track's GM program / the default timbre. Active when no override. */}
        <Row
          size="sm"
          hover="muted"
          selected={!customized}
          icon={<MdAutoMode />}
          actions={
            !customized ? <MdCheck className="size-3.5 text-primary" /> : undefined
          }
          actionsAlwaysVisible
          onClick={() => select(null)}
        >
          <span className="truncate">Auto</span>
        </Row>

        {groups.map(({ group, options: groupOptions }) => (
          // eslint-disable-next-line spacing/no-adhoc-spacing -- mt separates each instrument group header from the prior group (no named margin utility)
          <div key={group} className="mt-1">
            <div className="px-sm py-xs text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                      <Icon className="size-3.5" />
                    ) : (
                      <span className="size-3.5" />
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
      </Scroll>
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
    <Frame
      className="py-xs"
      leading={<ColorSwatch songId={songId} trackId={trackId} color={color} />}
      content={
        <div className={cn(hidden && "opacity-50")}>
          <Text as="div" variant="caption" className="truncate font-medium text-foreground">
            {name}
          </Text>
          <Stack direction="row" align="center" gap="xs" className="text-3xs text-muted-foreground">
            <InstrumentPicker
              songId={songId}
              trackId={trackId}
              options={options}
              resolvedId={instrumentId}
              resolvedLabel={instrumentLabel}
              customized={customized}
            />
            <span>
              · {noteCount} {noteCount === 1 ? "note" : "notes"}
            </span>
          </Stack>
        </div>
      }
      trailing={
        <Stack direction="row" align="center" gap="sm">
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
        </Stack>
      }
    />
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
    <Card className="rounded-lg p-lg">
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

        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt separates the track list from the section header above (no named margin utility) */}
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
