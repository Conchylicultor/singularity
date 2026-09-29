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

// Parse a migration file body. A file whose first line is not the expand marker
// is legacy. A file that starts phased but is malformed throws — never degrades
// to legacy, which would silently apply contract before its data.
export function parseMigration(sql: string): ParsedMigration {
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
