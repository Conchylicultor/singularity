import type { UnionColumnSpecs } from "@plugins/primitives/plugins/data-view/plugins/union-query/core";

/**
 * The base columns — the ones **every** run kind projects, and therefore the
 * only ones a filter, a sort or a group-by can mean the same thing by across
 * kinds.
 *
 * This object is the single declaration behind three things that would
 * otherwise drift: the union query's projection, the web `FieldDef[]`, and the
 * per-arm column map an arm has to fill in. An arm that forgets one of these is
 * a `tsc` error (see `RunArmBaseColumns` in `runs/server`), not a silently-NULL
 * column nobody notices until a list is missing a label.
 *
 * A NULL base column is a real answer, not a gap: a backup is host-global and
 * a deploy targets a remote box, so neither has a `namespace`, and reading null
 * there is honest where inventing one would not be.
 */
export const RUN_BASE_COLUMNS = {
  /** The row's identity within its own ledger. The keyset's total-order tail. */
  id: { type: "text", sqlType: "text", nullable: false },
  /** What this run was *of*, in the kind's own words — the row's title. */
  label: { type: "text", sqlType: "text", nullable: false },
  /** The shared status axis. See `run-outcome`. */
  outcome: { type: "enum", sqlType: "text", nullable: false },
  /** What set it off (a person, a schedule, another run). Null when unrecorded. */
  trigger: { type: "text", sqlType: "text", nullable: true },
  startedAt: { type: "date", sqlType: "timestamptz", nullable: false },
  /** Null exactly while the run is in flight. */
  finishedAt: { type: "date", sqlType: "timestamptz", nullable: true },
  /**
   * Wall-clock milliseconds, DERIVED by `defineRunKind` from `startedAt` /
   * `finishedAt` — never supplied by an arm. Two arms cannot then disagree about
   * what a duration is, and a run still in flight measures against `now()`
   * rather than reading as nothing.
   */
  duration: { type: "number", sqlType: "double precision", nullable: false },
  /** The worktree this run belongs to, where the kind has such a notion. */
  namespace: { type: "text", sqlType: "text", nullable: true },
  /** The failure's own words, kept verbatim. Null on a run with nothing to say. */
  message: { type: "text", sqlType: "text", nullable: true },
} as const satisfies UnionColumnSpecs;

export type RunBaseColumnId = keyof typeof RUN_BASE_COLUMNS;

/**
 * Base columns the compiler derives rather than collects. Excluded from what an
 * arm declares, so an arm cannot supply a duration at all — the strongest form
 * of "two arms cannot disagree" is that only one of them can speak.
 */
export type RunDerivedColumnId = "duration";

/** The base columns an arm binds itself. */
export type RunArmBaseColumnId = Exclude<RunBaseColumnId, RunDerivedColumnId>;

/**
 * Per-column nullability, lifted to the type level so `runs/server` can turn
 * "this column may be null" into "this key accepts `null`" without restating
 * the list. Lives in `core` because the declaration does.
 */
export type RunBaseColumnNullable = {
  [K in RunArmBaseColumnId]: (typeof RUN_BASE_COLUMNS)[K]["nullable"];
};

/**
 * Columns the free-text search box reaches. Everything a person types into it
 * is a name or an error — never an id, which would make the box a lookup rather
 * than a search.
 */
export const RUN_SEARCH_COLUMNS: RunBaseColumnId[] = [
  "label",
  "message",
  "namespace",
  "trigger",
];
