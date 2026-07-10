import { matchResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import {
  cn,
  Input,
  useControlSize,
  type ControlSize,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { updateSong, type Song } from "../../core";
import { useCurrentSong } from "../use-current-song";

/**
 * `Input` hardcodes `h-8` (it is not a density-participating primitive), so the
 * ambient toolbar density is applied as an explicit `control-*` override —
 * spelled out per density because Tailwind only emits class names it can see as
 * literals (a `control-${size}` template would compile to nothing).
 */
const CONTROL_HEIGHT: Record<ControlSize, string> = {
  xs: "control-xs",
  sm: "control-sm",
  md: "control-md",
  lg: "control-lg",
};

/**
 * The player toolbar's inline-editable song title (`SonataToolbar.Start`
 * "title"). The song title has exactly ONE client-side owner — the library's
 * `songsResource` — so this reads the canonical row via `useCurrentSong()` and
 * patches it through `PATCH /api/sonata/songs/:id`. There is no shell-context
 * mirror to seed from, and no source editor writes the title anymore.
 *
 * `matchResource` gates the mount so `useEditableField` is only ever seeded from
 * a *settled* title (the sanctioned "never autosave from a not-yet-loaded value"
 * guard, mirroring `PageHeader`). Renders nothing until a song row exists.
 */
export function SongTitle() {
  const size = useControlSize();
  const current = useCurrentSong();
  return matchResource(current, {
    // A title-shaped shimmer, not the word "Loading…" — this slot IS the header.
    // `Loading` only fades in after ~120ms, so a warm resource never flashes it.
    pending: () => (
      <Loading variant="block" className={cn(CONTROL_HEIGHT[size], "w-56")} />
    ),
    ready: (song) => (song ? <SongTitleInner song={song} /> : null),
  });
}

function SongTitleInner({ song }: { song: Song }) {
  const size = useControlSize();
  const { mutateAsync } = useEndpointMutation(updateSong);

  const title = useEditableField({
    value: song.title,
    label: "Song title",
    onSave: async (next) => {
      const trimmed = next.trim();
      // An empty title is not a rename — skip the write. The user can still
      // clear the input while typing; re-mounting re-seeds from the canonical
      // value, so the row is never left blank.
      if (!trimmed) return;
      await mutateAsync({ params: { id: song.id }, body: { title: trimmed } });
    },
  });

  // Reads as plain text until hovered/focused — the title IS the header, so the
  // input chrome only appears when it is being treated as one.
  return (
    <Input
      value={title.value}
      onChange={(e) => title.onChange(e.target.value)}
      onFocus={title.onFocus}
      onBlur={title.onBlur}
      placeholder="Untitled"
      aria-label="Song title"
      className={cn(
        CONTROL_HEIGHT[size],
        "w-56 border-transparent bg-transparent font-semibold hover:border-border focus:border-primary",
      )}
    />
  );
}
