import {
  DEFAULT_LOOP_SHAPE,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  countTokenSets,
  loadReadyIndexIdentity,
} from "@plugins/apps/plugins/chord/plugins/song-index/server";
import {
  buildCatalog,
  listedTokens,
  type Catalog,
  type CatalogState,
} from "../../core";

// ── The catalog, built once per loaded index ─────────────────────────────────
//
// `buildCatalog` folds every window of the index (one `countTokenSets` scan,
// ~84k rows on the full index) — far too much to redo on every push. The index
// only changes when a load finishes, so the built catalog is kept for as long
// as the loaded index is the same one: its snapshot, scope, derivation version
// and size (`loadReadyIndexIdentity`).

type Built = { key: string; catalog: Catalog; listed: ReadonlySet<ChordToken> };

let built: Built | null = null;
let building: { key: string; promise: Promise<Built> } | null = null;

/**
 * The catalog of the index as it stands: `not-ready` while it is not loaded —
 * answered from the status alone, so the many progress writes of a load cost
 * nothing — and never an empty catalog in its place.
 */
export async function loadCatalogState(): Promise<CatalogState> {
  const ready = await readyCatalog();
  return ready === null
    ? { kind: "not-ready" }
    : { kind: "ready", catalog: ready.catalog };
}

/** The set of chords some track lists, or `not-ready` while the index is not loaded. */
export type ListedChordsState =
  { kind: "not-ready" } | { kind: "ready"; listed: ReadonlySet<ChordToken> };

/**
 * Every chord some track lists — the complement is what the Rare joker
 * answers. Built once per loaded index (with the catalog), so a read is a
 * cached set; `not-ready` while the index is not loaded, never an empty set.
 */
export async function loadListedChords(): Promise<ListedChordsState> {
  const ready = await readyCatalog();
  return ready === null
    ? { kind: "not-ready" }
    : { kind: "ready", listed: ready.listed };
}

/**
 * Whether any track lists this chord — when it does not, the Rare joker is its
 * right answer. Throws while the index is not loaded: a round's loop came from
 * the index, so a round being judged means it was ready a moment ago.
 */
export async function isListedChord(token: ChordToken): Promise<boolean> {
  const ready = await readyCatalog();
  if (ready === null) {
    throw new Error(
      `isListedChord(${token}): the song index is not loaded, so no catalog says whether this chord is listed`,
    );
  }
  return ready.listed.has(token);
}

async function readyCatalog(): Promise<Built | null> {
  const key = await loadReadyIndexIdentity();
  if (key === null) {
    built = null;
    return null;
  }
  if (built?.key === key) return built;
  let flight = building?.key === key ? building : null;
  if (flight === null) {
    // One flight per index. Whatever it ends in, it clears itself; only a
    // success is kept, so a failed build is retried by the next read, and its
    // failure reaches every reader awaiting it.
    flight = {
      key,
      promise: (async () => {
        try {
          const catalog = buildCatalog(
            await countTokenSets({ shape: DEFAULT_LOOP_SHAPE }),
          );
          const result = { key, catalog, listed: listedTokens(catalog) };
          built = result;
          return result;
        } finally {
          if (building?.key === key) building = null;
        }
      })(),
    };
    building = flight;
  }
  return flight.promise;
}
