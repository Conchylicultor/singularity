import { queryRows } from "@plugins/database/plugins/sql-rows/core";
import { z } from "zod";
import { openShortLivedClient } from "./pool";
import type { ForkExclusions } from "./fork-exclusion";

// Turning the DECLARED exclusion set into the `pg_dump` flags a fork runs with,
// by reading the source database's own catalog.
//
// ── Why this file exists at all ──────────────────────────────────────────────
//
// The old spelling handed every declared pattern straight to `pg_dump`, which
// SILENTLY ACCEPTS a pattern that matches nothing. So a stale schema name, a
// typo, or an over-narrowed glob all produced the same thing: a fork that
// copied data nobody meant it to copy, with no error anywhere. `zero*` matches
// `zero`, `zero_0`, `zero_0/cdc` and `zero_0/cvr`; narrowing it to `zero_*` for
// apparent safety drops the bare `zero` schema out of the exclusion set
// forever, and the only way to notice is to query the live database.
//
// The fix is that a declared pattern is now matched HERE, against the catalog,
// and what reaches `pg_dump` is built out of names that were in it. So every
// question the old spelling could not answer — which schemas did this match,
// which matched nothing, which schema did nobody claim — is answerable, and
// this file answers them.
//
// ── Pure core, thin edge ─────────────────────────────────────────────────────
//
// `planForkExclusions` is pure and holds every rule; `readSchemaCatalog` is the
// one SQL statement. That split is not decoration: it is what lets the rules be
// tested with no database at all, which matters because `admin` cannot import
// `db-test-fixture` (the fixture imports `admin`, so a test edge back would
// close an R6 cycle).

/** One schema of the source database, as the plan needs to see it. */
export interface CatalogSchema {
  readonly name: string;
  /**
   * The relations `--exclude-table-data` can empty: ordinary and partitioned
   * tables, plus materialized views (whose "data" is the restore's
   * `REFRESH MATERIALIZED VIEW`, so excluding one leaves it unpopulated —
   * exactly the DDL-kept/rows-dropped shape).
   *
   * Sequences are deliberately absent. Their data component is a `setval`, and
   * suppressing it would restart a fork's sequences at their declared start
   * rather than continuing from the source's high-water mark — harmless either
   * way, and not worth enumerating.
   */
  readonly tables: readonly string[];
  /**
   * Partitioned parent → every descendant leaf of it in this schema.
   *
   * `--exclude-table-data` does NOT cascade to partitions (which is why
   * Postgres 16 grew a separate `…-and-children` flag), and a partition's rows
   * are dumped under the LEAF's own name. So a declaration naming a partitioned
   * parent has to be expanded here or it silently excludes nothing at all.
   * Nothing in this repo is partitioned yet; `traces` at 949 MB is the obvious
   * first candidate, and it is already named by an `ExcludeFromFork`.
   */
  readonly partitions: Readonly<Record<string, readonly string[]>>;
  /** Total on-disk size, only ever used to make a warning concrete. */
  readonly bytes: number;
  /** Owned by an installed extension (`pg_extension.extnamespace`). */
  readonly fromExtension: boolean;
}

/**
 * The source database's non-system schemas. `pg_*` and `information_schema` are
 * already filtered out here — they are Postgres's own and never a decision
 * anyone makes. Everything that IS a decision is left for
 * {@link planForkExclusions}.
 */
export interface SchemaCatalog {
  readonly schemas: readonly CatalogSchema[];
}

/**
 * The declared exclusion set no longer describes the source database, in a way
 * no fork can be correct under.
 *
 * A named class rather than a message convention because the failure is
 * DETERMINISTIC: the same declarations against the same catalog fail
 * identically every time, so the `database.fork` job re-raises it as a
 * `NonRetryableError` instead of burning five attempts and five notifications
 * on a fork that cannot succeed until somebody edits a contribution. `admin`
 * cannot import `infra/jobs` (that closes a cycle), so the class is the seam:
 * `admin` states what kind of failure this is, and `database/fork` decides what
 * the queue does about it.
 */
export class ForkPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForkPlanError";
  }
}

/** A schema holding data that no declaration claims. */
export interface UndeclaredSchema {
  readonly schema: string;
  readonly tableCount: number;
  readonly bytes: number;
}

/** What `forkDatabase` runs with. */
export interface ForkPlan {
  /**
   * `--exclude-table-data` arguments, every one of them built from a name that
   * was in {@link SchemaCatalog}.
   */
  readonly excludeTableData: readonly string[];
  /**
   * Declarations that matched nothing in the source, as human-readable lines.
   *
   * Reported, NOT fatal. A declaration matching nothing is benign — there is no
   * data to copy, so its intent already holds — and it happens legitimately: a
   * branch that adds a table together with its `ExcludeFromFork` forks from a
   * main whose database has not run that migration yet, and `zero*` matches
   * nothing on a database where zero-cache has never started. Failing here
   * would break worktree creation in both cases.
   */
  readonly unmatched: readonly string[];
  /**
   * Schemas holding data that NO declaration claims. Their rows are being
   * copied into this fork and every one after it, with nobody having decided
   * that — the case the old spelling could not even see.
   *
   * Reported rather than fatal, and that is a weighing rather than timidity.
   * The exclusion set comes from the FORKING CHECKOUT's contributions while the
   * catalog comes from MAIN's database, and those two drift by construction: a
   * branch cut before a plugin landed, a plugin deleted while its schemas stay
   * in main's database forever, one stray `CREATE SCHEMA` from a debugging
   * session. Refusing would turn any of those into "no worktree can be created
   * on this host" — strictly worse than copying the rows it was trying to save.
   * So the fork proceeds and says so, loudly, once per schema
   * (`database/fork`'s job raises the bell; the CLI prints it).
   */
  readonly undeclaredSchemas: readonly UndeclaredSchema[];
}

/**
 * Schemas whose rows ARE the app's own data and are copied wholesale. A table
 * inside one opts out individually via `ExcludeFromFork`.
 *
 * A closed list of one, kept explicit rather than implicit so the "nobody
 * claimed this schema" warning below can name it as one of the two answers.
 * Every table this repo declares in drizzle lives in `public`; a second entry
 * would mean the app grew a second schema of its own, which is a decision worth
 * making here rather than defaulting into.
 */
const APP_SCHEMA = "public";
const COPIED_SCHEMAS: readonly string[] = [APP_SCHEMA];

/**
 * Quote one identifier as a `pg_dump` PATTERN part.
 *
 * `pg_dump` parses `--exclude-table-data` with psql's identifier rules, not as a
 * literal string: an unquoted portion is case-folded to lower case and `*`/`?`
 * are wildcards. Zero's tables are mixed-case (`changeLog`, `publishedSchema`)
 * and its schemas contain a slash (`zero_0/cdc`), so an unquoted
 * `zero_0.changeLog` folds to `zero_0.changelog` and matches nothing at all —
 * the exact silent-miss this file exists to make impossible.
 *
 * Inside double quotes every character is literal (wildcards included) and only
 * `"` needs escaping, by doubling.
 *
 * `change-feed` has a byte-identical private twin (`quoteIdent` in its
 * `triggers.ts`) and the duplication is forced: `change-feed` imports `admin`,
 * so importing it back would close a cycle. If a third copy ever appears, that
 * is the moment to give quoting its own leaf plugin rather than a fourth.
 */
function quotePatternPart(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** A `pg_dump` pattern naming exactly one relation. */
function tablePattern(schema: string, table: string): string {
  return `${quotePatternPart(schema)}.${quotePatternPart(table)}`;
}

/**
 * A `pg_dump` pattern naming every relation in one schema, expanded by
 * `pg_dump` itself at DUMP time.
 *
 * Used whenever a declaration keeps nothing, and the reason is a race the
 * enumerated form cannot win: the catalog is read before the fork acquires its
 * host-wide slot, so a table created in the gap would be copied in full and
 * would not even appear in {@link ForkPlan.unmatched}, because the matching
 * already ran. Main runs a live zero-cache that mints schemas and tables on its
 * own schedule, so that gap is real. The schema NAME still comes from the
 * catalog — which is what every check below needs — while the table set is
 * resolved at the last possible instant.
 */
function schemaWildcardPattern(schema: string): string {
  return `${quotePatternPart(schema)}.*`;
}

/**
 * Does `pattern` match `name`?
 *
 * The declaration vocabulary is the glob authors already write (`zero*`), but
 * the matching is OURS now, not `pg_dump`'s — so it is exact and
 * case-sensitive rather than psql's case-folding identifier parse. Every schema
 * in this repo is lower-case, so the two agree today; being case-sensitive is
 * the honest reading of a pattern an author typed.
 */
function globMatches(pattern: string, name: string): boolean {
  const rx = pattern
    .split("")
    .map((ch) => {
      if (ch === "*") return ".*";
      if (ch === "?") return ".";
      return ch.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${rx}$`, "u").test(name);
}

/** Bytes as something a human reads, without pretending to precision. */
function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} kB`;
}

/** One line per finding, for a log or a notification. */
export function describeUndeclaredSchema(s: UndeclaredSchema): string {
  return (
    `schema "${s.schema}" (${s.tableCount} table(s), ${formatBytes(s.bytes)}) is claimed by no ` +
    `fork exclusion, so its rows are copied into every worktree`
  );
}

/**
 * Decide what the fork must not copy.
 *
 * THROWS {@link ForkPlanError} for the two states no fork can be correct under,
 * and that only an edit to THIS repo can cause — so refusing here can never be
 * triggered by the source database drifting ahead of the forking checkout:
 *
 *   1. **Two declarations matching one schema.** They carry two `keep` lists and
 *      there is no honest way to merge them; picking one silently voids the
 *      other's intent.
 *   2. **A `keep` entry naming no table in any schema its declaration matched.**
 *      The rows the author meant to preserve are emptied instead. For
 *      `graphile_worker`'s `migrations` that means every fork is born with a
 *      queue schema graphile believes is unmigrated, which breaks its boot —
 *      strictly worse, and far less legible, than refusing here.
 *
 * Everything else the catalog reveals is REPORTED — see {@link ForkPlan}'s
 * `unmatched` and `undeclaredSchemas` for why neither may stop a fork.
 *
 * Pure: no I/O, no clock, no registry read. Every input is an argument.
 */
export function planForkExclusions(
  catalog: SchemaCatalog,
  exclusions: ForkExclusions,
): ForkPlan {
  const unmatched: string[] = [];

  // Which declaration claims which schema. Built first because both the
  // duplicate rule and the undeclared warning are questions about this map.
  const owners = new Map<string, number[]>();
  for (const schema of catalog.schemas) {
    owners.set(
      schema.name,
      exclusions.schemas.flatMap((decl, i) =>
        globMatches(decl.schema, schema.name) ? [i] : [],
      ),
    );
  }

  // (1) Ambiguity, before anything is emitted.
  for (const [name, indices] of owners) {
    if (indices.length > 1) {
      const patterns = indices
        .map((i) => `"${exclusions.schemas[i]?.schema ?? "?"}"`)
        .join(", ");
      throw new ForkPlanError(
        `Fork exclusions are ambiguous: schema "${name}" is matched by ${indices.length} ` +
          `declarations (${patterns}). Each schema must be claimed by exactly one ` +
          `ExcludeSchemaDataFromFork contribution — two declarations have two different ` +
          `\`keep\` lists and there is no honest way to merge them. Narrow one of the patterns.`,
      );
    }
  }

  // Schemas nobody claimed, and that actually hold something. A schema with no
  // data-bearing relation (functions, types, enums only) has no rows to copy, so
  // there was nothing to decide and nothing worth telling anyone about.
  const undeclaredSchemas: UndeclaredSchema[] = catalog.schemas
    .filter(
      (s) =>
        !COPIED_SCHEMAS.includes(s.name) &&
        !s.fromExtension &&
        s.tables.length > 0 &&
        (owners.get(s.name)?.length ?? 0) === 0,
    )
    .map((s) => ({
      schema: s.name,
      tableCount: s.tables.length,
      bytes: s.bytes,
    }));

  const excludeTableData: string[] = [];

  for (const [i, decl] of exclusions.schemas.entries()) {
    const matched = catalog.schemas.filter(
      (s) => owners.get(s.name)?.includes(i) === true,
    );
    if (matched.length === 0) {
      unmatched.push(
        `schema pattern "${decl.schema}" matches no schema in the source database`,
      );
      // A `keep` on a schema that is not there is not actionable — the line
      // above is the whole story. Fall through rather than raising rule (2).
      continue;
    }
    // (2) A keep entry must name a real table in at least one matched schema.
    // "At least one" rather than "all": a pattern may span a family of schemas
    // (`zero*`) whose members do not share a table list.
    for (const keep of decl.keep) {
      if (!matched.some((s) => s.tables.includes(keep))) {
        throw new ForkPlanError(
          `Fork exclusion for schema pattern "${decl.schema}" wants to keep table "${keep}", ` +
            `but no schema it matches (${matched.map((s) => s.name).join(", ")}) has a table ` +
            `by that name. The rows you meant to preserve would be emptied instead — for a ` +
            `migration-watermark table that silently breaks the service in every fork. ` +
            `Fix the name, or drop it from \`keep\`.`,
        );
      }
    }
    for (const schema of matched) {
      // Keeping nothing is expressible as one dump-time wildcard, which is both
      // shorter and immune to a relation appearing after the catalog was read.
      if (decl.keep.length === 0) {
        excludeTableData.push(schemaWildcardPattern(schema.name));
        continue;
      }
      // A keep-list has to be enumerated — `pg_dump` has no "all but these".
      // The narrow cost is that a relation created in this schema between the
      // catalog read and the dump is copied; the only schema in that arm is
      // `graphile_worker`, whose table set changes only when graphile migrates.
      for (const table of schema.tables) {
        if (decl.keep.includes(table)) continue;
        excludeTableData.push(tablePattern(schema.name, table));
      }
    }
  }

  // Table-level declarations name this repo's own drizzle tables, which all live
  // in the one copied schema. A table elsewhere is covered by its schema's
  // declaration instead.
  const appSchema = catalog.schemas.find((s) => s.name === APP_SCHEMA);
  for (const table of exclusions.tables) {
    if (!appSchema?.tables.includes(table)) {
      unmatched.push(
        `table "${APP_SCHEMA}.${table}" does not exist in the source database`,
      );
      continue;
    }
    // The parent AND every partition under it: a partition's rows are dumped
    // under the leaf's own name, so excluding only the parent excludes nothing.
    for (const name of [table, ...(appSchema.partitions[table] ?? [])]) {
      excludeTableData.push(tablePattern(APP_SCHEMA, name));
    }
  }

  return { excludeTableData, unmatched, undeclaredSchemas };
}

/**
 * Read the source database's schemas, their data-bearing relations, their
 * partition trees, their size and whether an extension owns them.
 *
 * `pg_*` (which covers `pg_toast`, `pg_temp_*` and `pg_toast_temp_*`) and
 * `information_schema` are filtered here rather than in the plan: they are
 * Postgres's own bookkeeping and never something a plugin author decides about.
 * Extension ownership IS carried through, because "an extension's schema is the
 * extension's business" is a policy of this design and belongs beside the other
 * policies.
 */
/**
 * The shape of one catalog row, PARSED rather than asserted.
 *
 * This is not ceremony. `pg` decodes a result column using the parser
 * registered for its type OID, and there is none for `name[]` (OID 1003) — the
 * type `array_agg(relname)` produces, since `pg_class.relname` is `name`, not
 * `text`. So an uncast `array_agg` arrives as the RAW literal
 * `"{_private_jobs,migrations,…}"`: a string, which every array operation below
 * accepts and silently misreads. `for (const t of tables)` walks it one
 * character at a time and emits `"graphile_worker"."_"`, `…"."p"`, …; every one
 * of those matches nothing, `pg_dump` says nothing, and the fork copies the
 * whole schema. That is the exact class of silent miss this file exists to
 * remove, reintroduced one layer lower — and it survived a real fork, which is
 * how it was found.
 *
 * The `::text` casts below are the fix; the parse is what makes the fix
 * enforced rather than remembered — and it is no longer a habit local to this
 * file. The read goes through `queryRows`, the one door every raw-SQL row read
 * in the repo now takes, so this schema is checked by the same code that checks
 * every other one, and a column that disagrees with it names itself and its pg
 * type OID. A boundary between untyped SQL and typed code gets a parser, not a
 * type assertion.
 */
const CatalogRowSchema = z.object({
  name: z.string(),
  tables: z.array(z.string()),
  partitions: z.record(z.string(), z.array(z.string())).nullable(),
  bytes: z.string(),
  from_extension: z.boolean(),
});

/**
 * Read the source database's schemas, their data-bearing relations, their
 * partition trees, their size and whether an extension owns them.
 *
 * `pg_*` (which covers `pg_toast`, `pg_temp_*` and `pg_toast_temp_*`) and
 * `information_schema` are filtered here rather than in the plan: they are
 * Postgres's own bookkeeping and never something a plugin author decides about.
 * Extension ownership IS carried through, because "an extension's schema is the
 * extension's business" is a policy of this design and belongs beside the other
 * policies.
 */
export async function readSchemaCatalog(
  source: string,
): Promise<SchemaCatalog> {
  const pool = openShortLivedClient(source);
  try {
    // Every `relname` is cast to `text`. `relname` is `name`, and `pg` cannot
    // decode `name[]` — see CatalogRowSchema for what that silently produced.
    const rows = await queryRows(pool, {
      sql: `
      WITH RECURSIVE
        -- Every (top-level partitioned root, descendant) pair, so a multi-level
        -- partition tree collapses onto the relation a declaration would name.
        tree AS (
          SELECT i.inhparent AS root, i.inhrelid AS member
            FROM pg_inherits i
           WHERE NOT EXISTS (SELECT 1 FROM pg_inherits up
                              WHERE up.inhrelid = i.inhparent)
          UNION ALL
          SELECT t.root, i.inhrelid
            FROM tree t JOIN pg_inherits i ON i.inhparent = t.member
        ),
        rel AS (
          SELECT c.oid, c.relname::text AS relname, c.relnamespace,
                 pg_total_relation_size(c.oid) AS bytes
            FROM pg_class c
           WHERE c.relkind IN ('r', 'p', 'm')
        )
      SELECT n.nspname::text                         AS name,
             coalesce(r.tables, ARRAY[]::text[])     AS tables,
             coalesce(r.bytes, 0)::text              AS bytes,
             p.partitions                            AS partitions,
             EXISTS (SELECT 1 FROM pg_extension e
                      WHERE e.extnamespace = n.oid)  AS from_extension
        FROM pg_namespace n
        LEFT JOIN LATERAL (
               SELECT array_agg(rel.relname ORDER BY rel.relname) AS tables,
                      sum(rel.bytes)                              AS bytes
                 FROM rel WHERE rel.relnamespace = n.oid
             ) r ON true
        LEFT JOIN LATERAL (
               SELECT jsonb_object_agg(x.root, x.members) AS partitions
                 FROM (
                       SELECT root.relname AS root,
                              array_agg(member.relname ORDER BY member.relname) AS members
                         FROM tree
                         JOIN rel root   ON root.oid = tree.root
                         JOIN rel member ON member.oid = tree.member
                        WHERE root.relnamespace = n.oid
                          AND member.relnamespace = n.oid
                        GROUP BY root.relname
                      ) x
             ) p ON true
       WHERE n.nspname NOT LIKE 'pg\\_%'
         AND n.nspname <> 'information_schema'
       ORDER BY n.nspname
    `,
      row: CatalogRowSchema,
    });
    return {
      schemas: rows.map((r) => ({
        name: r.name,
        tables: r.tables,
        partitions: r.partitions ?? {},
        bytes: Number(r.bytes),
        fromExtension: r.from_extension,
      })),
    };
  } finally {
    await pool.end();
  }
}

/** {@link readSchemaCatalog} then {@link planForkExclusions}. */
export async function resolveForkPlan(
  source: string,
  exclusions: ForkExclusions,
): Promise<ForkPlan> {
  return planForkExclusions(await readSchemaCatalog(source), exclusions);
}
