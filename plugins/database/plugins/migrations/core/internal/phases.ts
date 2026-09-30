// The phased-migration file grammar: the one spelling shared by the generator
// that writes it (cli/plugins/migrations) and the runner that reads it
// (migrations/server). See research/2026-09-29-global-phased-migrations.md.
//
// A phased schema migration is drizzle's generated DDL, split at generation time
// into an `expand` section (permissive: existing rows and code stay valid) and a
// `contract` section (restrictive or data-destroying), plus the branch-local data
// migrations it claims. The runner applies one push as ONE group:
//
//   expand → claimed data migrations (timestamp order) → contract
//
// Every file without the header — everything written before this grammar, and
// every data migration — is `legacy`: applied whole, at its own timestamp.
//
//   -- singularity:phase expand
//   CREATE TABLE IF NOT EXISTS "x" (...);
//   -- singularity:phase contract
//   ALTER TABLE "agents" DROP COLUMN IF EXISTS "icon_svg_nodes";
//   -- singularity:claims
//   -- 20260927_182347__remap_saved_icons_to_symbols
//
// A claim names a data migration by `<YYYYMMDD_HHMMSS>__<slug>` — its filename
// minus the content hash, because a branch-local data migration is re-hashed on
// every build while its timestamp and slug never change.
//
// A MERGE NODE (research/2026-09-30-global-clone-migrations-published-set.md
// §3) is a phased file with empty sections and no claims, preceded by one
// header line naming the snapshot ids it joins:
//
//   -- singularity:merge-snapshot parents=<snapshotIdA>,<snapshotIdB>
//   -- singularity:phase expand
//   -- singularity:phase contract
//   -- singularity:claims
//
// Its SQL does nothing — each side's own migrations already apply that side's
// DDL — and its snapshot is the 3-way merge of the parents. The header is the
// one place a snapshot DAG edge beyond `prevId` is recorded.

const MERGE_HEADER = "-- singularity:merge-snapshot";
const MERGE_HEADER_RE =
  /^-- singularity:merge-snapshot parents=([0-9a-f-]+(?:,[0-9a-f-]+)+)$/;
const SNAPSHOT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const EXPAND = "-- singularity:phase expand";
const CONTRACT = "-- singularity:phase contract";
const CLAIMS = "-- singularity:claims";

const MIGRATION_FILE_RE = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;
const CLAIM_ID_RE = /^\d{8}_\d{6}__[a-z0-9_]+$/;

export interface PhasedMigration {
  expand: string;
  contract: string;
  claims: readonly string[];
}

export type ParsedMigration =
  { kind: "legacy"; sql: string } | ({ kind: "phased" } & PhasedMigration);

// The claim id of a migration file: its name without the content hash.
export function migrationClaimId(file: string): string {
  const m = MIGRATION_FILE_RE.exec(file);
  if (!m) throw new Error(`not a migration filename: ${file}`);
  return `${m[1]}_${m[2]}__${m[4]}`;
}

function assertClaimId(id: string): void {
  if (!CLAIM_ID_RE.test(id))
    throw new Error(`malformed migration claim: "${id}"`);
}

// Render the sections into the file body the generator writes (and hashes).
// Each section is the statements' SQL, verbatim; an empty section is written
// empty so the file always carries all three markers.
export function renderPhasedMigration(m: PhasedMigration): string {
  for (const c of m.claims) assertClaimId(c);
  const section = (s: string) => (s.trim() === "" ? "" : `${s.trim()}\n`);
  return (
    `${EXPAND}\n${section(m.expand)}` +
    `${CONTRACT}\n${section(m.contract)}` +
    `${CLAIMS}\n${m.claims.map((c) => `-- ${c}\n`).join("")}`
  );
}

// The body of a merge node joining `parents` (snapshot ids, in snapshot-file
// order): the header, then an empty phased migration.
export function renderMergeSnapshotMigration(
  parents: readonly string[],
): string {
  if (parents.length < 2)
    throw new Error(
      `a merge node joins at least two snapshots, got ${parents.length}`,
    );
  for (const p of parents) {
    if (!SNAPSHOT_ID_RE.test(p))
      throw new Error(`malformed snapshot id in merge node: "${p}"`);
  }
  return (
    `${MERGE_HEADER} parents=${parents.join(",")}\n` +
    renderPhasedMigration({ expand: "", contract: "", claims: [] })
  );
}

// The snapshot ids a merge node joins, read from its first line; null for any
// other migration. A first line that starts like the header but does not parse
// throws — a merge edge must never be silently dropped from the DAG.
export function mergeSnapshotParents(sql: string): string[] | null {
  const eol = sql.indexOf("\n");
  const first = (eol === -1 ? sql : sql.slice(0, eol)).trimEnd();
  if (!first.startsWith(MERGE_HEADER)) return null;
  const m = MERGE_HEADER_RE.exec(first);
  if (!m) throw new Error(`malformed merge-snapshot header: ${first}`);
  const parents = m[1]!.split(",");
  for (const p of parents) {
    if (!SNAPSHOT_ID_RE.test(p))
      throw new Error(`malformed snapshot id in merge-snapshot header: "${p}"`);
  }
  return parents;
}

// Parse a migration file body. A file whose first line is not the expand marker
// is legacy. A file that starts phased but is malformed throws — never degrades
// to legacy, which would silently apply contract before its data. A merge
// node's header line is skipped; what follows it must be phased.
export function parseMigration(sql: string): ParsedMigration {
  if (mergeSnapshotParents(sql) !== null) {
    const eol = sql.indexOf("\n");
    const parsed = eol === -1 ? null : parseMigration(sql.slice(eol + 1));
    if (parsed?.kind !== "phased")
      throw new Error(
        `a merge-snapshot migration must be phased after its header line`,
      );
    return parsed;
  }
  const lines = sql.split("\n");
  if (lines[0]?.trimEnd() !== EXPAND) return { kind: "legacy", sql };

  const contractAt = lines.findIndex((l) => l.trimEnd() === CONTRACT);
  const claimsAt = lines.findIndex((l) => l.trimEnd() === CLAIMS);
  if (contractAt < 1 || claimsAt < contractAt) {
    throw new Error(
      `phased migration is malformed: expected "${EXPAND}", "${CONTRACT}", "${CLAIMS}" in that order`,
    );
  }
  for (const [i, l] of lines.entries()) {
    if (
      i !== 0 &&
      i !== contractAt &&
      i !== claimsAt &&
      l.trimStart().startsWith("-- singularity:")
    ) {
      throw new Error(
        `phased migration has a duplicate marker at line ${i + 1}: ${l}`,
      );
    }
  }

  const claims = lines
    .slice(claimsAt + 1)
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((l) => {
      if (!l.startsWith("-- ")) {
        throw new Error(
          `phased migration claims section holds a non-claim line: ${l}`,
        );
      }
      const id = l.slice(3).trim();
      assertClaimId(id);
      return id;
    });

  return {
    kind: "phased",
    expand: lines.slice(1, contractAt).join("\n").trim(),
    contract: lines
      .slice(contractAt + 1, claimsAt)
      .join("\n")
      .trim(),
    claims,
  };
}
