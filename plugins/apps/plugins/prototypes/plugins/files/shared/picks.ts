import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  StoredPicksSchema,
  applyPicksChange,
  isPrototypeId,
  type PicksChange,
  type StoredPicks,
} from "../core";
import { withHistoryLock } from "./history/lock";

// The option-picks store: ONE JSON file per prototype, `<prototypes>/_picks/<id>.json`,
// holding the raw picks — `{ "palette": "azure" }`. Every surface reads and
// writes that one file (main, every worktree deploy, every browser), so the
// variant the user picked is the variant everybody sees, and an agent can read
// it with `./singularity prototype options <id>`.
//
// Beside the folders, not in them: a picks file inside a prototype would churn
// its signature (a reload of every open frame), its thumbnail fingerprint and
// its version history — and a pick is not part of the design. `_picks/` is
// `_`-prefixed, so every reader of the tree skips it the way it skips
// `_template/` and `_history/` (`listPrototypeDirNames`).
//
// Node-only and in `shared/` for the reason `history/store.ts` is: the server
// serves and writes the picks, and `./singularity prototype options|list` reads
// the same files with no backend running.
//
// Design: `research/2026-09-16-global-shared-prototype-option-picks.md`.

/** The picks dir's name inside the prototypes data dir. */
export const PICKS_DIR_NAME = "_picks";

/** A picks file's extension — the one the watcher's extension filter passes. */
export const PICKS_FILE_EXT = ".json";

/** A picks file's state. `present: false` is "no file" — nothing picked — not "empty". */
export type PicksFileSnapshot =
  { present: false } | { present: true; bytes: string };

/**
 * Callbacks run INSIDE the prototype's lock, around the one write a change
 * makes — so what they read of the file is exactly what this write replaced
 * and what it left, with no other writer in between. Neither runs when the
 * change changes nothing.
 */
export interface PicksWriteHooks {
  beforeWrite?: () => void;
  afterWrite?: () => void;
}

export interface PicksStore {
  /** The absolute path of a prototype's picks file (present or not). */
  fileOf(id: string): string;
  /** The stored picks; `{}` when there is no file. A malformed file throws. */
  read(id: string): Promise<StoredPicks>;
  /**
   * Apply one change under the prototype's lock (read → fold → write), and
   * answer with the picks it left. A `reset` removes the file. A change that
   * changes nothing writes nothing.
   */
  write(
    id: string,
    change: PicksChange,
    hooks?: PicksWriteHooks,
  ): Promise<StoredPicks>;
  /** Put the file back to exactly `snapshot` (its bytes, or no file), under the lock. */
  restore(id: string, snapshot: PicksFileSnapshot): Promise<void>;
}

/**
 * The store over a prototypes tree at `root` — resolved by the caller
 * (`prototypesDir.path`, per call; the tests pass a temp dir), like
 * `openHistoryStore`.
 */
export function openPicksStore(root: string): PicksStore {
  const picksDir = join(root, PICKS_DIR_NAME);
  const fileOf = (id: string) =>
    join(picksDir, `${assertPrototypeId(id)}${PICKS_FILE_EXT}`);
  // One flock per prototype, never unlinked (see `withHistoryLock`). Its
  // extension is not one the watcher passes.
  const lockOf = (id: string) =>
    join(picksDir, `${assertPrototypeId(id)}.lock`);

  async function readFileState(id: string): Promise<PicksFileSnapshot> {
    try {
      return { present: true, bytes: await readFile(fileOf(id), "utf8") };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { present: false };
      }
      throw err;
    }
  }

  async function read(id: string): Promise<StoredPicks> {
    const state = await readFileState(id);
    return state.present ? parsePicksFile(fileOf(id), state.bytes) : {};
  }

  async function writeBytes(id: string, bytes: string): Promise<void> {
    const path = fileOf(id);
    // `.tmp`, not `.json`: the watcher's extension filter must not pass the
    // temp — the same rule as the history's `latest.json` stamp.
    const temp = `${path}.tmp`;
    await writeFile(temp, bytes);
    await rename(temp, path);
  }

  async function locked<T>(id: string, fn: () => Promise<T>): Promise<T> {
    await mkdir(picksDir, { recursive: true });
    return withHistoryLock(lockOf(id), fn);
  }

  return {
    fileOf,
    read,

    write(id, change, hooks = {}) {
      return locked(id, async () => {
        const before = await read(id);
        const after = applyPicksChange(before, change);
        if (samePicks(before, after)) return before;

        hooks.beforeWrite?.();
        if (Object.keys(after).length === 0) {
          await rm(fileOf(id), { force: true });
        } else {
          await writeBytes(id, formatPicksFile(after));
        }
        hooks.afterWrite?.();
        return after;
      });
    },

    restore(id, snapshot) {
      return locked(id, async () => {
        if (snapshot.present) await writeBytes(id, snapshot.bytes);
        else await rm(fileOf(id), { force: true });
      });
    },
  };
}

/** The file's bytes for `picks`: pretty JSON, so a person can read it too. */
function formatPicksFile(picks: StoredPicks): string {
  return `${JSON.stringify(picks, null, 2)}\n`;
}

/**
 * Parse a picks file. Malformed is a THROW, never `{}`: an unreadable record is
 * not "nothing picked", and answering as if it were would show the defaults
 * while claiming they are the user's choice — then the next pick would
 * overwrite the file and lose whatever was in it.
 */
function parsePicksFile(path: string, bytes: string): StoredPicks {
  let json: unknown;
  try {
    json = JSON.parse(bytes);
  } catch (err) {
    throw new Error(`malformed prototype picks file ${path}: ${String(err)}`);
  }
  const parsed = StoredPicksSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `malformed prototype picks file ${path}: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** Same keys, same values — order is not a change (the fold keeps an existing key's place). */
function samePicks(a: StoredPicks, b: StoredPicks): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  );
}

// Every id becomes a path, so it is checked before it touches the filesystem:
// a route answers 404 for a name that is not an id before it gets here, so past
// that a bad id is a caller bug, and the store throws.
function assertPrototypeId(id: string): string {
  if (!isPrototypeId(id)) {
    throw new Error(`not a prototype id: ${JSON.stringify(id)}`);
  }
  return id;
}
