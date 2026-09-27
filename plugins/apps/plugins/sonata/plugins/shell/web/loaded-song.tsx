import { useMemo, type ReactNode } from "react";
import { defineScopedStore } from "@plugins/primitives/plugins/scope/plugins/scoped-store/web";
import { Sonata } from "./slots";
import type { SongSetting, SongSettingKey } from "./song-setting";

/**
 * The song a Sonata surface has loaded — its id, its content (every source's
 * raw input) and its per-song settings — as ONE state under ONE id. There is no
 * way to hold one song's content with another song's settings: loading a
 * different song replaces all three at once, its settings starting empty
 * (pending), and a setting can only be written for the song held.
 */
interface LoadedSong {
  songId: string;
  /**
   * Bumped whenever a DIFFERENT song is loaded — never by a reload of the same
   * song, which keeps its settings. The settings' observers mount keyed on it
   * (`SongSettingsMount`), so whenever a song's settings start empty its
   * observers mount afresh and settle them: even a song loaded again after
   * another one in the same tick (A → B → A), whose id alone would not change.
   */
  generation: number;
  /** Each source's raw input, by source id. */
  rawById: Readonly<Record<string, unknown>>;
  /** The song's settled settings — a setting not in here is pending. */
  settings: ReadonlyMap<SongSettingKey<unknown>, unknown>;
}

const loadedSongStore = defineScopedStore<LoadedSong | null>(null);

const NO_RAW: Readonly<Record<string, unknown>> = {};
const NO_SETTINGS: ReadonlyMap<SongSettingKey<unknown>, unknown> = new Map();
/** The one pending value, shared, so a still-pending read changes nothing a reader sees. */
const PENDING: { pending: true } = { pending: true };

/**
 * Provides one Sonata surface's loaded song. Mounted in `SonataLayout` ABOVE
 * `SonataProvider`, whose own body loads songs and reads the content and the
 * settings (a component cannot use a store its own JSX provides).
 */
export function LoadedSongProvider({ children }: { children: ReactNode }) {
  return <loadedSongStore.Provider>{children}</loadedSongStore.Provider>;
}

// --- Content — the shell's own (`SonataProvider`). --------------------------

/**
 * Load `songId` with its content. The same song as the one held keeps its
 * settings (a reload of its sources); any other song replaces the song, its
 * content AND its settings in one write — pending until its observers settle
 * them.
 */
export function useLoadSong(): (
  songId: string,
  rawById: Readonly<Record<string, unknown>>,
) => void {
  const api = loadedSongStore.useStoreApi();
  return useMemo(
    () => (songId: string, rawById: Readonly<Record<string, unknown>>) =>
      api.setState((prev) =>
        prev !== null && prev.songId === songId
          ? { ...prev, rawById }
          : {
              songId,
              generation: (prev?.generation ?? 0) + 1,
              rawById,
              settings: NO_SETTINGS,
            },
      ),
    [api],
  );
}

/**
 * Write one source's raw input into the loaded song — a source editor's edit.
 * Throws when no song is loaded: an editor only exists inside a loaded song's
 * player, so an edit with none is a broken assumption, not a case to absorb.
 */
export function useEditLoadedRaw(): (sourceId: string, raw: unknown) => void {
  const api = loadedSongStore.useStoreApi();
  return useMemo(
    () => (sourceId: string, raw: unknown) =>
      api.setState((prev) => {
        if (prev === null) {
          throw new Error(
            `Sonata: source "${sourceId}" edited with no song loaded`,
          );
        }
        return { ...prev, rawById: { ...prev.rawById, [sourceId]: raw } };
      }),
    [api],
  );
}

/** The loaded song's raw inputs by source id — none before a song is loaded. */
export function useLoadedRaw(): Readonly<Record<string, unknown>> {
  return loadedSongStore.useSelector((s) => s?.rawById ?? NO_RAW, []);
}

/** Which song is loaded, and which load of it (see `LoadedSong.generation`). */
export interface LoadedSongIdentity {
  songId: string;
  generation: number;
}

export function useLoadedSongIdentity(): LoadedSongIdentity | null {
  return loadedSongStore.useSelector<LoadedSongIdentity | null>(
    (s) => (s === null ? null : { songId: s.songId, generation: s.generation }),
    [],
    (a, b) => a?.generation === b?.generation && a?.songId === b?.songId,
  );
}

// --- Settings — read and written by any plugin. -----------------------------

/**
 * The per-song settings the running composition registers: one per
 * `Sonata.SongSetting` contribution, each paired with the observer that
 * settles it. Read from the slot, so the shell names no feature, and a setting
 * whose feature plugin is absent is never waited on.
 */
function useRegisteredSettings(): ReadonlySet<SongSettingKey<unknown>> {
  const contributions = Sonata.SongSetting.useContributions();
  return useMemo(
    () => new Set(contributions.map((c) => c.setting)),
    [contributions],
  );
}

/**
 * `key`'s state in `loaded`: its value once written; else pending while the
 * composition registers it; else — nothing in this composition persists it —
 * its `absent` value, which is then the truth.
 */
function readSetting<T>(
  loaded: LoadedSong | null,
  key: SongSettingKey<T>,
  registered: ReadonlySet<SongSettingKey<unknown>>,
): SongSetting<T> {
  if (loaded !== null && loaded.settings.has(key)) {
    // The value was written through `useWriteSongSetting(key)`, typed `T`.
    return { pending: false, value: loaded.settings.get(key) as T };
  }
  if (registered.has(key)) return PENDING;
  return { pending: false, value: key.absent };
}

function sameSetting<T>(a: SongSetting<T>, b: SongSetting<T>): boolean {
  if (a.pending || b.pending) return a.pending === b.pending;
  return Object.is(a.value, b.value);
}

/**
 * Reactive read of one setting for the loaded song — pending until its
 * observer has settled it (see {@link readSetting}).
 */
export function useSongSetting<T>(key: SongSettingKey<T>): SongSetting<T> {
  const registered = useRegisteredSettings();
  return loadedSongStore.useSelector(
    (loaded) => readSetting(loaded, key, registered),
    [key, registered],
    sameSetting,
  );
}

/**
 * Set `songId`'s value of one setting — its observer syncing the persisted
 * value, or a control setting it optimistically. Dropped unless `songId` is
 * the loaded song, so a late push for a song that is no longer loaded can never
 * land on the next one. Bails on an unchanged value (no listener fan-out).
 */
export function useWriteSongSetting<T>(
  key: SongSettingKey<T>,
): (songId: string, value: T) => void {
  const api = loadedSongStore.useStoreApi();
  return useMemo(
    () => (songId: string, value: T) =>
      api.setState((prev) => {
        if (prev === null || prev.songId !== songId) return prev;
        if (
          prev.settings.has(key) &&
          Object.is(prev.settings.get(key), value)
        ) {
          return prev;
        }
        const settings = new Map(prev.settings);
        settings.set(key, value);
        return { ...prev, settings };
      }),
    [api, key],
  );
}

/** The value types of a record of setting keys. */
export type SongSettingValues<
  K extends Record<string, SongSettingKey<unknown>>,
> = { [P in keyof K]: K[P] extends SongSettingKey<infer T> ? T : never };

function sameValues<V extends object>(
  a: SongSetting<V>,
  b: SongSetting<V>,
): boolean {
  if (a.pending || b.pending) return a.pending === b.pending;
  const av = a.value as Record<string, unknown>;
  const bv = b.value as Record<string, unknown>;
  return Object.keys(av).every((k) => Object.is(av[k], bv[k]));
}

/**
 * The loaded song's values of `keys` — pending until EVERY setting the
 * composition registers has settled for it, not only these: nothing of the
 * song may render or play while any of its settings is still loading (a muted
 * track audible). A setting nobody registers is never waited on, and reads as
 * its `absent` value. Re-renders only when that gate flips or one of `keys`'
 * values changes — never for another setting's value (a fader move).
 *
 * `keys` must be stable (a module constant).
 */
export function useSettledSongSettings<
  K extends Record<string, SongSettingKey<unknown>>,
>(keys: K): SongSetting<SongSettingValues<K>> {
  const registered = useRegisteredSettings();
  return loadedSongStore.useSelector(
    (loaded): SongSetting<SongSettingValues<K>> => {
      if (loaded === null) return PENDING;
      for (const key of registered) {
        if (!loaded.settings.has(key)) return PENDING;
      }
      const value: Record<string, unknown> = {};
      for (const [name, key] of Object.entries(keys)) {
        const setting = readSetting(loaded, key, registered);
        if (setting.pending) return PENDING;
        value[name] = setting.value;
      }
      return { pending: false, value: value as SongSettingValues<K> };
    },
    [keys, registered],
    sameValues,
  );
}
