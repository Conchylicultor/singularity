/**
 * The stored row shape the matching engine reads.
 *
 * This is DELIBERATELY a local structural declaration rather than an import of
 * `page/editor`'s `StoredBlock`. That type is declared in
 * `editor/server/internal/page-content.ts` and exported from the SERVER barrel,
 * and a `core` module may not import a server barrel (runtime isolation: `core`
 * imports `core`). The alternative — moving `StoredBlock` down into
 * `editor/core` — would widen another plugin's public API for one consumer's
 * convenience.
 *
 * The coupling this leaves is the weakest kind available: a *structural* row
 * shape, so the server-side caller passes `StoredBlock[]` straight in and tsc
 * proves the two agree at that call site. If `StoredBlock` grows a field this
 * engine needs, the field is added here and the call site keeps compiling; if it
 * LOSES one this engine reads, the call site stops compiling. Nothing is
 * duplicated but the five column names the engine actually reads.
 *
 * (`page/read-only-view` and the pages history diff already carry the same
 * structural mirror for the same reason, so this is the established shape of the
 * answer in this codebase, not a new one.)
 */
export interface StoredRow {
  id: string;
  parentId: string | null;
  type: string;
  /** The stored `jsonb` payload — always JSON-serializable. */
  data: unknown;
  /** The raw stored fractional index; only meaningful within one sibling list. */
  rank: string;
  expanded: boolean;
}
