import type { ForkExclusions } from "./fork-exclusion";
import {
  APP_SCHEMA,
  describeKeptLinks,
  planTableExclusions,
  quotePatternPart,
  readSchemaCatalog,
  tablePattern,
  type SchemaCatalog,
} from "./catalog-plan";

// The catalog shape is shared with backups (./catalog-plan); re-exported so the
// fork's own suite keeps naming it from the file whose rules it tests.
export type { SchemaCatalog } from "./catalog-plan";

// Turning the DECLARED exclusion set into the `pg_dump` flags a fork runs with,
// by reading the source database's own catalog.
//
// ── Why this file exists at all ──────────────────────────────────────────────
//
// The old spelling handed every declared pattern straight to `pg_dump`, which
// SILENTLY ACCEPTS a pattern that matches nothing. So a stale schema name, a
// typo, or an over-narrowed glob all produced the same thing: a fork that
// copied data nobody meant it to copy, with no error anywhere. A family glob
// like `ext*` matches `ext`, `ext_0` and `ext_0/log`; narrowing it to `ext_*`
// for apparent safety drops the bare `ext` schema out of the exclusion set
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
// one SQL statement (it lives in ./catalog-plan with the pattern quoting and the
// table-level rule, which backups share). That split is not decoration: it is
// what lets the rules be tested with no database at all, which matters because
// `admin` cannot import `db-test-fixture` (the fixture imports `admin`, so a
// test edge back would close an R6 cycle).

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
   * main whose database has not run that migration yet, and a schema pattern
   * matches nothing on a database where the service that creates those schemas
   * has never run. Failing here would break worktree creation in both cases.
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
const COPIED_SCHEMAS: readonly string[] = [APP_SCHEMA];

/**
 * A `pg_dump` pattern naming every relation in one schema, expanded by
 * `pg_dump` itself at DUMP time.
 *
 * Used whenever a declaration keeps nothing, and the reason is a race the
 * enumerated form cannot win: the catalog is read before the fork acquires its
 * host-wide slot, so a table created in the gap would be copied in full and
 * would not even appear in {@link ForkPlan.unmatched}, because the matching
 * already ran. A service that creates tables on its own schedule in main's
 * database makes that gap real. The schema NAME still comes from the
 * catalog — which is what every check below needs — while the table set is
 * resolved at the last possible instant.
 */
function schemaWildcardPattern(schema: string): string {
  return `${quotePatternPart(schema)}.*`;
}

/**
 * Does `pattern` match `name`?
 *
 * The declaration vocabulary is the glob authors already write (`ext*`), but
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
 * THROWS {@link ForkPlanError} for the three states no fork can be correct under,
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
 *   3. **A kept table with a foreign key to a left-out table.** `pg_restore`
 *      re-adds the constraint after loading the data, so a kept row pointing at
 *      a left-out row fails the restore (see `KeptLinkToLeftOut` in
 *      ./catalog-plan). Both tables are in the catalog, and the link is this
 *      repo's own drizzle schema — so this too is an edit here, not drift.
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
    // (`ext*`) whose members do not share a table list.
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
  // declaration instead. The rule (exists in `public`, expand partitions) is
  // shared with backups — see ./catalog-plan.
  const tables = planTableExclusions(catalog, exclusions.tables);
  // (3) A kept → left-out foreign key.
  if (tables.keptLinks.length > 0) {
    throw new ForkPlanError(describeKeptLinks("fork", tables.keptLinks));
  }
  excludeTableData.push(...tables.excludeTableData);
  unmatched.push(...tables.unmatched);

  return { excludeTableData, unmatched, undeclaredSchemas };
}

/** {@link readSchemaCatalog} then {@link planForkExclusions}. */
export async function resolveForkPlan(
  source: string,
  exclusions: ForkExclusions,
): Promise<ForkPlan> {
  return planForkExclusions(await readSchemaCatalog(source), exclusions);
}
