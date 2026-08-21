import { createHash } from "crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";
// The plugin dir is drizzle-kit's cwd, and every relative path in
// drizzle.config.ts resolves against it (the `schema:` globs and `out`). Taken
// from the migrations plugin rather than re-typed here: a drifted copy would run
// generation from a directory where the globs match nothing, and drizzle-kit
// exits 0 having discovered no tables — a silent DROP, not an error. Safe to
// import at module eval: migrations/core is a side-effect-free leaf (unlike
// @plugins/database/server, which throws without SINGULARITY_WORKTREE), and it
// reaches no registered pre-barrel/post-web codegen manifest, which is the
// property cli:codegen-manifests-not-frozen holds over the whole CLI process's
// import closure: a manifest frozen at CLI load is regenerated on disk by stage
// 2 but never re-read, and pruneOrphanedConfigFiles then deletes a
// freshly-authored config override.
// `drizzleGenerateArgv` comes from the same barrel and for the same reason: the
// migrations plugin owns HOW its tool is invoked (argv) as well as from WHERE
// (cwd), so neither can drift per call site.
import {
  drizzleGenerateArgv,
  MIGRATIONS_PLUGIN_DIR,
} from "@plugins/database/plugins/migrations/core";
import {
  spawnCaptured,
  spawnExpectOk,
} from "@plugins/infra/plugins/spawn/core";
import {
  promptKey,
  runDrizzleKitWithPrompts,
  type DetectedPrompt,
  type MigrationAnswer,
} from "./migrations-interactive";

// The interactive drizzle-kit runner (the CLI's one sanctioned streaming-stdio
// child) and its prompt model live in ./migrations-interactive.ts; re-exported
// here so existing consumers (build.ts, regen-migrations.ts, the tests) keep
// their import site.
export {
  promptKey,
  resolveAnswer,
  runDrizzleKitWithPrompts,
} from "./migrations-interactive";
export type {
  PromptOption,
  DetectedPrompt,
  MigrationAnswer,
  DrizzlePromptResult,
} from "./migrations-interactive";

// Wedge-breaker for the local `git` metadata reads in this file — orders of
// magnitude above what any of them take, so only a wedged child trips it. A CLI
// process owns no deadline of its own, but that is a reason to bound these, not
// to leave them open: nothing else would ever break such a wedge (the
// fleet-level op-wedge watchdog was retired 2026-07-28).
const GIT_TIMEOUT_MS = 60_000;

/**
 * Parse a `--migration-answers <json>` argv value into the answer list
 * `generateMigration` consumes. Lives HERE, beside `MigrationAnswer` itself,
 * rather than in one command: every command that can drive a migration
 * (`build`, `build --hermetic`) takes the same flag, and a second hand-rolled
 * copy of this validator is exactly how the three divergent `readDatabaseConfig`
 * readers this plan started by unifying came about.
 *
 * MAY TERMINATE THE PROCESS: exits 1 on malformed input. That is argv
 * validation — it runs before any artifact exists and owes no cleanup.
 */
export function parseMigrationAnswers(raw: string): MigrationAnswer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    console.error(
      `Error: --migration-answers is not valid JSON.\n` +
        `Expected: '[{"action":"create"},{"action":"rename","from":"old_name"}]'\n`,
    );
    process.exit(1);
  }
  if (!Array.isArray(parsed)) {
    console.error(
      `Error: --migration-answers must be a JSON array.\n` +
        `Expected: '[{"action":"create"},{"action":"rename","from":"old_name"}]'\n`,
    );
    process.exit(1);
  }
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (entry.action === "create") continue;
    if (entry.action === "rename" && typeof entry.from === "string") continue;
    console.error(
      `Error: --migration-answers[${i}] is invalid: ${JSON.stringify(entry)}\n` +
        `Each entry must be {"action":"create"} or {"action":"rename","from":"<source_name>"}.\n`,
    );
    process.exit(1);
  }
  return parsed as MigrationAnswer[];
}

/**
 * One persisted answer in a `meta/_<tag>_answers.json` sidecar. Carries the
 * entity identity (so it survives reordering on regen) plus the resolved action.
 */
export type KeyedAnswerEntry =
  | { key: string; entityType: string; entityName: string; action: "create" }
  | {
      key: string;
      entityType: string;
      entityName: string;
      action: "rename";
      from: string;
    };

interface AnswersSidecar {
  version: 1;
  answers: KeyedAnswerEntry[];
}

/**
 * The `meta/` filename holding migration `<tag>`'s answers.
 *
 * **The leading underscore is load-bearing.** drizzle-kit's `prepareOutFolder`
 * runs its pg-schema snapshot validator over every `meta/*.json` whose name does
 * NOT start with `_`, and a sidecar is not a snapshot — so an unprefixed one
 * makes drizzle print "data is malformed", exit 0, and generate nothing. That
 * blocks every subsequent build in the repo, permanently, from the first
 * answered prompt onward. `_journal.json` sits in that directory unmolested for
 * exactly this reason.
 *
 * The name is derived HERE, in one function, rather than interpolated at each of
 * the four call sites (writer, reader, two cleanup paths): a prefix that only
 * three of them apply is the same outage arriving later and harder to see.
 */
const ANSWERS_PREFIX = "_";
const ANSWERS_SUFFIX = "_answers.json";

export function answersSidecarName(tag: string): string {
  return `${ANSWERS_PREFIX}${tag}${ANSWERS_SUFFIX}`;
}

/**
 * Read every branch-local `meta/_*_answers.json` sidecar (those whose migration
 * `.sql` is NOT tracked on origin/main) and merge their entries into one keyed
 * map. Main's accumulated sidecars are ignored, so a re-emitted prompt is only
 * ever resolved from this branch's own authored answers. Fails loud on malformed
 * JSON (lets JSON.parse throw).
 */
export async function readBranchLocalAnswers(
  root: string,
  migrationsDir: string,
): Promise<Map<string, MigrationAnswer>> {
  const map = new Map<string, MigrationAnswer>();
  const ref = await resolveMainRef(root);
  const metaDir = join(migrationsDir, "meta");
  if (!existsSync(metaDir)) return map;
  const tracked = ref
    ? await listTrackedMigrationBasenames(root, ref)
    : new Set<string>();

  for (const f of readdirSync(metaDir)) {
    if (!f.startsWith(ANSWERS_PREFIX) || !f.endsWith(ANSWERS_SUFFIX)) continue;
    // A sidecar _<tag>_answers.json maps to migration <tag>.sql; skip sidecars
    // whose migration is already on main (their answers are immutable history).
    const tag = f.slice(ANSWERS_PREFIX.length, -ANSWERS_SUFFIX.length);
    const sqlBasename = `${tag}.sql`;
    if (tracked.has(sqlBasename)) continue;
    const raw = readFileSync(join(metaDir, f), "utf8");
    const parsed = JSON.parse(raw) as AnswersSidecar;
    for (const entry of parsed.answers) {
      map.set(
        entry.key,
        entry.action === "rename"
          ? { action: "rename", from: entry.from }
          : { action: "create" },
      );
    }
  }
  return map;
}

/**
 * Write a `meta/_<schemaTag>_answers.json` sidecar capturing the resolved
 * create-vs-rename decision for each prompt, keyed by entity identity so a later
 * regen can replay it. `resolve` yields the answer chosen for a given prompt.
 */
export function writeAnswersSidecar(
  metaDir: string,
  schemaTag: string,
  prompts: DetectedPrompt[],
  resolve: (p: DetectedPrompt) => MigrationAnswer,
): void {
  const answers: KeyedAnswerEntry[] = prompts.map((p) => {
    const a = resolve(p);
    const base = {
      key: promptKey(p),
      entityType: p.entityType,
      entityName: p.entityName,
    };
    return a.action === "rename"
      ? { ...base, action: "rename" as const, from: a.from }
      : { ...base, action: "create" as const };
  });
  const sidecar: AnswersSidecar = { version: 1, answers };
  writeFileSync(
    join(metaDir, answersSidecarName(schemaTag)),
    JSON.stringify(sidecar, null, 2) + "\n",
  );
}

// ─── (interactive runner moved to ./migrations-interactive.ts) ───────────────

const NEW_FORMAT = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;
// Drizzle-kit normally numbers files (0000, 0001, …) but emits "0NaN" when
// it can't derive the next index from existing (non-matching) filenames.
const DRIZZLE_FORMAT = /^(\d{4}|0NaN)_(.+)\.sql$/;
const MIGRATION_NAME_REGEX = /^[a-z0-9_]+$/;

// drizzle-kit --custom seeds every custom migration with this exact placeholder
// body (no trailing newline). Because the body is byte-identical across all
// custom migrations, so is its content hash (b3cc75fa) — and the runner keys
// applied-state by that hash (the filename's sha8). Two custom migrations would
// therefore claim the same hash, and the second is silently skipped by the
// runner (the hash is a PRIMARY KEY in __singularity_migrations). Before hashing
// in renameMigrations we rewrite the placeholder to embed the migration's unique
// timestamp+slug, giving every custom migration a distinct content hash while
// preserving the filename-hash == sha256(content) invariant the push-time
// hand-edit detector relies on.
const DRIZZLE_CUSTOM_PLACEHOLDER =
  "-- Custom SQL migration file, put your code below! --";

/** What a completed `generateMigration` reports back to its caller. */
export interface GenerateMigrationResult {
  /** Peak RSS (bytes) of the drizzle-kit child, when the runtime reported rusage. */
  maxRssBytes: number | undefined;
}

/**
 * Run `drizzle-kit generate`; detect whether it produced a new migration;
 * require --migration-name when it did; rename new files to the hash-based
 * format. Exits the process on error.
 *
 * POST-CONDITION: `meta/_journal.json` describes the `.sql` files on disk. It is
 * regenerated unconditionally — on entry, on every discard, and at the exit —
 * never as a side effect of having renamed or deleted something. The journal is
 * a pure re-encoding of the filenames, so a redundant regen writes identical
 * bytes; a MISSING one is how a branch-local data migration ends up orphaned
 * after the `regen-migrations` merge driver resolves the journal in main's
 * favour during a rebase. This function is the single funnel every caller
 * (`build`, `build --hermetic`, `regen-migrations`) reaches that repair
 * through.
 *
 * Regeneration is placed at explicit call sites rather than a `try/finally`:
 * `process.exit()` does not unwind the stack, and this function has six terminal
 * exits downstream of its first mutation.
 *
 * When drizzle-kit shows interactive rename/create prompts:
 * - Without migrationAnswers: discovers all prompts (auto-advancing with
 *   "create"), discards generated files, prints structured JSON, exits 2.
 * - With migrationAnswers: uses the provided semantic answers and proceeds.
 *
 * Returns the drizzle-kit child's peak RSS so the build can profile this phase
 * (it runs outside every host grant — see the memory-dimension plan doc).
 */
export async function generateMigration(opts: {
  root: string;
  worktreeName: string;
  migrationName?: string;
  resetMigration?: boolean;
  customMigration?: boolean;
  migrationAnswers?: MigrationAnswer[];
}): Promise<GenerateMigrationResult> {
  const {
    root,
    worktreeName,
    migrationName,
    resetMigration,
    customMigration,
    migrationAnswers,
  } = opts;

  if (migrationName && !MIGRATION_NAME_REGEX.test(migrationName)) {
    console.error(
      `Invalid --migration-name "${migrationName}". Use lowercase letters, digits, and underscores only.`,
    );
    process.exit(1);
  }

  const migrationsDir = resolve(
    root,
    "plugins/database/plugins/migrations/data",
  );

  // Regen mode (resetMigration with no positional answers) replays the persisted
  // create-vs-rename decisions. Read the branch-local sidecars NOW — before the
  // reset below deletes them — so a re-emitted prompt resolves by entity identity.
  const keyedAnswers =
    resetMigration && !migrationAnswers
      ? await readBranchLocalAnswers(root, migrationsDir)
      : undefined;

  if (resetMigration) {
    await resetBranchLocalMigrations(root, migrationsDir);
  }

  // Self-heal the filename-hash == content-hash invariant for branch-local data
  // migrations (snapshot-less .sql). A --custom migration freezes its hash at the
  // empty file when first generated; once the agent hand-edits the SQL the runner
  // (which identifies migrations by their filename hash) would otherwise silently
  // skip the new content or diverge across DBs. Re-hashing on every build keeps
  // the identity honest. Never touches migrations already on origin/main — their
  // hashes are locked into every deployed DB.
  await rehashBranchLocalDataMigrations(root, migrationsDir);

  // Re-establish journal↔filename consistency before anything else runs. Two
  // paths get NO other regen: every abort between here and `renameMigrations`
  // exits the process, and a branch carrying only a data migration skips all
  // three downstream regens (reset preserves it, rehash finds its hash already
  // correct, drizzle emits no schema delta) — which is exactly the branch whose
  // journal entry the `regen-migrations` merge driver just resolved away in
  // main's favour. NOT about drizzle-kit's inputs: it picks the prior snapshot
  // off a sorted `readdir(meta)`, and reads the journal only for `idx`.
  regenerateJournal(migrationsDir);

  const before = new Set(readdirSync(migrationsDir));

  // The argv comes from the migrations plugin, which owns it: the binary name and
  // `generate` are welded together there (with the load-bearing `--bun` flag), so
  // this call site configures FLAGS and cannot express another subcommand.
  const cmd = drizzleGenerateArgv({
    custom: customMigration,
    name: migrationName,
  });

  const cwd = resolve(root, MIGRATIONS_PLUGIN_DIR);
  const result = await runDrizzleKitWithPrompts({
    cmd,
    cwd,
    // No PG* env: `generate` is a pure snapshot diff against ./data and opens no
    // connection, and drizzle.config.ts no longer reads the database config at
    // all. Passing libpqEnv() here is what made this step ENOENT on a host with
    // no ~/.singularity/state/db-config/database.json. SINGULARITY_WORKTREE stays: the schema
    // files are import-safe without it (client.ts defers the throw to the first
    // query), but keeping it leaves the dev loop byte-identical.
    env: {
      ...process.env,
      SINGULARITY_WORKTREE: worktreeName,
    },
    answers: migrationAnswers ?? null,
    keyedAnswers,
    echo: true,
  });

  if (result.exitCode !== 0) process.exit(1);
  if (/\b(error|collision|conflict)\b/i.test(result.stderrBuf)) {
    console.error(
      "\nError: drizzle-kit printed a diagnostic but exited 0. Treating as failure.\n" +
        "If this is a snapshot-chain collision, rebase onto origin/main, then re-run\n" +
        "  ./singularity build --reset-migration --migration-name <slug>\n" +
        "to drop this branch's migration and regenerate it against the new tip.",
    );
    process.exit(1);
  }

  const combined = `${result.stdoutBuf}\n${result.stderrBuf}`;

  // drizzle-kit's `prepareOutFolder` runs the pg-schema validator over EVERY
  // `meta/*.json` whose name doesn't start with `_` — which sweeps in our
  // `*_answers.json` sidecars, which are not snapshots and never parse. On a
  // failure it prints "<file> data is malformed" to STDOUT (hence `combined`,
  // not stderrBuf) and calls process.exit(0). Paired with the `added.length ===
  // 0` early return below, that would silently stop migration generation
  // repo-wide from the first answers sidecar that lands on main. Fail loud.
  if (/\bdata is malformed\b/i.test(combined)) {
    console.error(
      "\nError: drizzle-kit rejected a file in meta/ as malformed and exited 0 —\n" +
        "no migration was generated, silently. Its snapshot validator scans every\n" +
        "meta/*.json not starting with '_', including our *_answers.json sidecars.\n" +
        "The offending file is named in the output above.\n\n" +
        "AGENT: Stop here and report this to the user. Do NOT delete the file to make\n" +
        "the message go away — a malformed snapshot breaks the chain for everyone.",
    );
    process.exit(1);
  }

  if (
    /require\(\) async module|async module.*unsupported|\bTypeError\b|Cannot find module|Cannot use import statement/i.test(
      combined,
    )
  ) {
    console.error(
      "\nError: drizzle-kit exited 0 but failed to load a schema file — the table(s) it\n" +
        "defines would be SILENTLY DROPPED from migration generation. A schema-glob file\n" +
        "(server/**/internal/{tables,schema}.ts) has an async-only module (top-level await,\n" +
        "e.g. lexical/@lexical/yjs) in its import graph. Fix the offending import; run\n" +
        "`./singularity check schema-files-loadable` to see exactly which file.",
    );
    process.exit(1);
  }

  // INVARIANT: never keep a migration generated with prompts unless answers were
  // provided. In keyed (regen) mode `migrationAnswers` is undefined but answers
  // come from the sidecar map — so exclude keyed mode here; its own unanswered
  // check below handles the abort.
  if (result.detectedPrompts.length > 0 && !migrationAnswers && !keyedAnswers) {
    const added = readdirSync(migrationsDir).filter(
      (f: string) => f.endsWith(".sql") && !before.has(f),
    );
    discardGenerated(migrationsDir, added);
    console.log("\nMIGRATION_PROMPTS_DETECTED");
    console.log(JSON.stringify(result.detectedPrompts, null, 2));
    console.error(
      "\ndrizzle-kit encountered ambiguous schema changes that require explicit answers.\n" +
        "Re-run with --migration-answers to provide choices. Example:\n" +
        `  ./singularity build --migration-name <slug> --migration-answers '${JSON.stringify(result.detectedPrompts.map(() => ({ action: "create" })))}'\n\n` +
        "AGENT: Stop here and report this to the user. Show them the detected prompts\n" +
        "above and ask which action to take for each. Do not auto-select or retry\n" +
        "without explicit user input. If this feature does not work as expected or\n" +
        "has limitations, report that clearly rather than working around it.\n",
    );
    process.exit(2);
  }

  // Keyed (regen) mode: a re-emitted prompt had no persisted answer (or its
  // rename source was missing). Discard the generated files and stop loudly —
  // the sidecar must be (re-)authored before push can normalize this branch.
  if (keyedAnswers && result.unanswered.length > 0) {
    const added = readdirSync(migrationsDir).filter(
      (f: string) => f.endsWith(".sql") && !before.has(f),
    );
    discardGenerated(migrationsDir, added);
    console.error(
      "\ndrizzle-kit showed an ambiguous create-vs-rename prompt with no persisted answer:\n" +
        result.unanswered.map((k) => `  ${k}`).join("\n") +
        "\n\nThe regen replays answers from meta/<tag>_answers.json, but these keys are\n" +
        "absent (a new ambiguity introduced after the original authoring). Author the\n" +
        "decision first on the original migration via:\n" +
        "  ./singularity build --migration-name <slug> --migration-answers '[...]'\n\n" +
        "AGENT: Stop here and report this to the user. Do not retry or hand-edit the\n" +
        "generated SQL — the create-vs-rename choice must be made explicitly.\n",
    );
    process.exit(2);
  }

  const added = readdirSync(migrationsDir).filter(
    (f: string) => f.endsWith(".sql") && !before.has(f),
  );

  if (added.length === 0) {
    if (migrationName) {
      console.warn(
        "--migration-name was provided but no schema change was detected; ignoring.",
      );
    }
    return { maxRssBytes: result.maxRssBytes };
  }

  if (!migrationName) {
    discardGenerated(migrationsDir, added);
    console.error(
      "\nError: DB schema change detected — a new migration is required, but --migration-name was not provided.\n" +
        "\n" +
        "Re-run with:\n" +
        "  ./singularity build --migration-name <short_slug>\n" +
        "\n" +
        "Examples:\n" +
        "  --migration-name add_task_priority      (added a column/table)\n" +
        "  --migration-name remove_yak_shaving     (removed a plugin's tables)\n" +
        "\n" +
        "If you removed a plugin or table: this is expected — drizzle generates a DROP TABLE\n" +
        "migration automatically. Do NOT delete migration files or snapshots by hand;\n" +
        "that breaks the snapshot chain for every other agent.\n",
    );
    process.exit(1);
  }

  // Reorder DROP VIEW / CREATE VIEW statements into dependency order BEFORE
  // renameMigrations hashes the content (so the committed filename's sha8
  // matches its reordered body). drizzle-kit emits view statements in
  // snapshot/alphabetical order, which can drop a dependency before its
  // dependent (Postgres refuses); this fixes the order in place.
  reorderViewStatements(migrationsDir);

  const renameResult = renameMigrations(migrationsDir);
  for (const r of renameResult.renamed) {
    console.log(`  ${r.from} → ${r.to}`);
  }

  // Data/backfill migrations (--custom) carry no schema delta, so they must NOT
  // join the drizzle snapshot chain — otherwise they Y-fork against any schema
  // migration main adds concurrently, and pushing them becomes impossible outside
  // a quiet window. Drop the snapshot drizzle emitted; the migration stays a .sql
  // + journal entry, applied by the runner via filename hash. drizzle bases the
  // next migration on the last *schema* snapshot, which is correct since this one
  // changed no schema. (The 3 oldest backfills on main already have no snapshot.)
  if (customMigration) {
    const metaDir = join(migrationsDir, "meta");
    for (const r of renameResult.renamed) {
      const snap = join(metaDir, `${r.to.slice(0, -4)}_snapshot.json`);
      if (existsSync(snap)) {
        rmSync(snap, { force: true });
        console.log(`  dropped snapshot for data migration ${r.to}`);
      }
    }
  }

  // Persist the create-vs-rename decision alongside the migration so a later
  // regen (which re-emits a consolidated migration) replays it instead of
  // re-prompting and aborting the push. Only schema migrations that actually
  // showed prompts get a sidecar — find the single renamed entry whose snapshot
  // exists (the schema migration; data/custom ones have their snapshot dropped
  // above and never prompt).
  if (result.detectedPrompts.length > 0) {
    const metaDir = join(migrationsDir, "meta");
    const schemaRename = renameResult.renamed.find((r) =>
      existsSync(join(metaDir, `${r.to.slice(0, -4)}_snapshot.json`)),
    );
    if (schemaRename) {
      const schemaTag = schemaRename.to.slice(0, -4);
      // Keyed mode resolves by entity identity; authoring mode pairs prompt i
      // with the positional answer i (detect-mode order matches answer order).
      const resolver = keyedAnswers
        ? (p: DetectedPrompt) => keyedAnswers.get(promptKey(p))!
        : (p: DetectedPrompt) =>
            migrationAnswers![result.detectedPrompts.indexOf(p)]!;
      writeAnswersSidecar(metaDir, schemaTag, result.detectedPrompts, resolver);
      console.log(`  wrote answers sidecar ${answersSidecarName(schemaTag)}`);
    }
  }

  // The post-condition, stated at the exit rather than left to be inferred from
  // `renameMigrations`' own call: whatever this function did, the journal it
  // leaves behind describes the `.sql` files on disk.
  regenerateJournal(migrationsDir);

  return { maxRssBytes: result.maxRssBytes };
}

/**
 * Re-derive the filename hash from current content for branch-local data
 * migrations — NEW_FORMAT .sql files with no sibling snapshot that are absent
 * from origin/main. Keeps filename-hash == content-hash so the runner (which
 * identifies migrations by filename hash) never silently skips hand-edited
 * backfill SQL. Preserves the timestamp (and thus ordering); only the hash token
 * changes. Schema migrations keep their snapshot and are left untouched — their
 * SQL must match the snapshot's DDL and must never be silently re-hashed. Files
 * already on origin/main are immutable (their hash is recorded in deployed DBs).
 *
 * Does NOT touch the journal: its caller regenerates unconditionally right
 * after. Regenerating here only when a rename happened is how a branch-local
 * data migration whose hash was already correct could end up with no journal
 * entry at all.
 */
async function rehashBranchLocalDataMigrations(
  root: string,
  migrationsDir: string,
): Promise<void> {
  const ref = await resolveRef(root);
  if (!ref) return; // can't determine the branch-local set; leave files untouched
  const tracked = await listTrackedMigrationBasenames(root, ref);
  const metaDir = join(migrationsDir, "meta");

  for (const f of readdirSync(migrationsDir)) {
    const m = NEW_FORMAT.exec(f);
    if (!m) continue;
    if (tracked.has(f)) continue; // already on main — immutable
    const [, date, time, oldHash, name] = m;
    // Snapshot present => schema migration; skip (its SQL is snapshot-bound).
    if (existsSync(join(metaDir, `${f.slice(0, -4)}_snapshot.json`))) continue;
    const sql = readFileSync(join(migrationsDir, f), "utf8");
    const newHash = createHash("sha256").update(sql).digest("hex").slice(0, 8);
    if (newHash === oldHash) continue;
    const newName = `${date}_${time}_${newHash}__${name}.sql`;
    renameSync(join(migrationsDir, f), join(migrationsDir, newName));
    console.log(`  rehashed data migration ${f} → ${newName}`);
  }
}

/**
 * Delete migration files that exist in the working tree but not at
 * `origin/main` (or local `main` as fallback). Used by `--reset-migration`
 * to recover from a snapshot-chain Y-fork after rebasing onto main: the
 * branch-local migration is dropped so drizzle-kit can re-emit a fresh one
 * against the rebased tip.
 *
 * Only ever touches files absent from the chosen ref, so a shared migration
 * cannot be removed by accident.
 *
 * Does NOT touch the journal: its caller regenerates unconditionally right
 * after. Regenerating here only when something was actually removed is how a
 * branch carrying only a (deliberately preserved) data migration took the
 * early return below and left a stale journal behind.
 */
async function resetBranchLocalMigrations(
  root: string,
  migrationsDir: string,
): Promise<void> {
  const ref = await resolveRef(root);
  if (!ref) {
    console.error(
      "--reset-migration needs `origin/main` or `main` to compare against; run `git fetch origin main` first.",
    );
    process.exit(1);
  }

  const tracked = await listTrackedMigrationBasenames(root, ref);
  const metaDir = join(migrationsDir, "meta");

  const removed: string[] = [];
  for (const f of readdirSync(migrationsDir)) {
    if (!f.endsWith(".sql")) continue;
    if (tracked.has(f)) continue;
    // Preserve data migrations (snapshot-less): plain drizzle generate can't
    // recreate their hand-written SQL, so deleting them here would lose the
    // backfill. They never join the snapshot chain, so they don't need resetting.
    if (!existsSync(join(metaDir, `${f.slice(0, -4)}_snapshot.json`))) continue;
    rmSync(join(migrationsDir, f), { force: true });
    removed.push(f);
    // Drop the answers sidecar too — regen reads it before this reset runs, so
    // the in-memory keyed map already captured it; the on-disk copy is rewritten
    // for the consolidated migration after generate.
    rmSync(join(metaDir, answersSidecarName(f.slice(0, -4))), { force: true });
  }
  for (const f of readdirSync(metaDir)) {
    if (!f.endsWith("_snapshot.json")) continue;
    if (tracked.has(f)) continue;
    rmSync(join(metaDir, f), { force: true });
    removed.push(`meta/${f}`);
  }

  if (removed.length === 0) {
    console.log(
      "(--reset-migration: no branch-local migrations found, nothing to reset)",
    );
    return;
  }

  for (const f of removed) console.log(`  removed ${f}`);
}

async function resolveRef(root: string): Promise<string | null> {
  for (const ref of ["origin/main", "main"]) {
    const result = await spawnCaptured(["git", "rev-parse", "--verify", ref], {
      cwd: root,
      timeoutMs: GIT_TIMEOUT_MS,
    });
    if (result.exitCode === 0) return ref;
  }
  return null;
}

export async function resolveMainRef(root: string): Promise<string | null> {
  return resolveRef(root);
}

export async function listTrackedMigrationBasenames(
  root: string,
  ref: string,
): Promise<Set<string>> {
  // `ref` was already verified by resolveRef, so a failure here is unexpected —
  // spawnExpectOk throws rather than absorbing it into an empty set.
  const result = await spawnExpectOk(
    [
      "git",
      "ls-tree",
      "-r",
      "--name-only",
      ref,
      "--",
      "plugins/database/plugins/migrations/data",
    ],
    { cwd: root, timeoutMs: GIT_TIMEOUT_MS },
  );
  return new Set(
    result.stdout
      .split("\n")
      .filter(Boolean)
      .map((p) => p.split("/").pop() ?? p),
  );
}

export interface RenameResult {
  renamed: Array<{ from: string; to: string; hash: string }>;
}

export function renameMigrations(migrationsDir: string): RenameResult {
  const metaDir = join(migrationsDir, "meta");
  const renamed: RenameResult["renamed"] = [];

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (NEW_FORMAT.test(file)) continue;
    const m = DRIZZLE_FORMAT.exec(file);
    if (!m) continue;
    const [, idx, name] = m;

    const sqlPath = join(migrationsDir, file);
    const ts = timestampNow();
    let sql = readFileSync(sqlPath, "utf8");
    if (sql.trim() === DRIZZLE_CUSTOM_PLACEHOLDER) {
      // Uniquify the empty custom-migration body so its content hash is distinct
      // (see DRIZZLE_CUSTOM_PLACEHOLDER). The marker is keyed to this file's
      // timestamp+slug — which the filename also encodes — so hash-uniqueness
      // tracks filename-uniqueness. The agent writes the real backfill SQL below
      // it; the next build re-derives the hash from the edited content
      // (rehashBranchLocalDataMigrations), so the marker only seeds the identity.
      sql = `${DRIZZLE_CUSTOM_PLACEHOLDER}\n-- migration: ${ts}__${name} --\n`;
      writeFileSync(sqlPath, sql);
    }
    const hash = createHash("sha256").update(sql).digest("hex").slice(0, 8);
    const newName = `${ts}_${hash}__${name}.sql`;

    renameSync(sqlPath, join(migrationsDir, newName));

    const oldSnap = join(metaDir, `${idx}_snapshot.json`);
    const newSnap = join(metaDir, `${ts}_${hash}__${name}_snapshot.json`);
    if (existsSync(oldSnap)) renameSync(oldSnap, newSnap);

    renamed.push({ from: file, to: newName, hash });
  }

  regenerateJournal(migrationsDir);
  return { renamed };
}

// ─── View statement dependency reordering ────────────────────────────────────

const STATEMENT_BREAKPOINT = "--> statement-breakpoint";
// DROP VIEW [MATERIALIZED] "schema"."name" — capture the bare view name.
const DROP_VIEW_RE =
  /^\s*DROP\s+(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+EXISTS\s+)?(?:"[^"]+"\.)?"([^"]+)"/i;
// CREATE [OR REPLACE] [MATERIALIZED] VIEW "schema"."name" AS … — capture the name.
const CREATE_VIEW_RE =
  /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:"[^"]+"\.)?"([^"]+)"/i;

interface ViewStatement {
  /** Index of this statement within the file's statement list. */
  pos: number;
  kind: "drop" | "create";
  view: string;
  text: string;
}

/**
 * Topologically sort `nodes` given a `deps` map (node → set of nodes it depends
 * on, restricted to `nodes`). Returns dependency order (a node appears after all
 * the nodes it depends on). Throws on a cycle — fail loud, never emit a bad order.
 */
function topoSort(nodes: string[], deps: Map<string, Set<string>>): string[] {
  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();

  const visit = (n: string, stack: string[]): void => {
    const s = state.get(n);
    if (s === "done") return;
    if (s === "visiting") {
      throw new Error(
        `Cycle detected among views while reordering migration statements: ` +
          `${[...stack, n].join(" → ")}`,
      );
    }
    state.set(n, "visiting");
    for (const dep of deps.get(n) ?? []) {
      if (nodes.includes(dep)) visit(dep, [...stack, n]);
    }
    state.set(n, "done");
    order.push(n);
  };

  for (const n of nodes) visit(n, []);
  return order;
}

/**
 * Read the prior snapshot's `views` map (keyed `"public.<name>"`, each value
 * `{ name, definition, … }`), used to derive dependencies for views this
 * migration DROPs without recreating (their body isn't in the SQL).
 *
 * "Prior" is resolved the same way drizzle-kit resolves it in
 * `preparePrevSnapshot` — the lexicographically last `meta/*_snapshot.json` —
 * NOT via the journal. drizzle names the snapshot it just emitted by its numeric
 * prefix (`0NaN_snapshot.json`), which sorts before every `<YYYYMMDD>_…` name,
 * so it excludes itself and the last real snapshot wins.
 *
 * This used to read the journal's last entry and look for `<tag>_snapshot.json`.
 * That never resolved: drizzle's `writeResult` appends to the journal BEFORE
 * writing the `.sql`, so the last tag is `0NaN_<name>` while the file on disk is
 * `0NaN_snapshot.json` — the lookup always missed and this function always
 * returned an empty map, silently degrading pure-DROP view ordering. Resolving
 * off the snapshot listing also leaves the journal a pure post-condition of the
 * pipeline, never an input to it.
 */
function readPriorSnapshotViewDefs(migrationsDir: string): Map<string, string> {
  const defs = new Map<string, string>();
  const metaDir = join(migrationsDir, "meta");
  if (!existsSync(metaDir)) return defs;

  const SNAPSHOT_SUFFIX = "_snapshot.json";
  const priorSnapshot = readdirSync(metaDir)
    .filter(
      (f) =>
        f.endsWith(SNAPSHOT_SUFFIX) &&
        // Excludes the `0NaN_snapshot.json` drizzle just emitted, and any
        // *_answers.json sidecar (whose tail would otherwise slice into a
        // NEW_FORMAT-shaped name).
        NEW_FORMAT.test(`${f.slice(0, -SNAPSHOT_SUFFIX.length)}.sql`),
    )
    .sort()
    .at(-1);
  if (!priorSnapshot) return defs;

  const snap = JSON.parse(
    readFileSync(join(metaDir, priorSnapshot), "utf8"),
  ) as {
    views?: Record<string, { name?: string; definition?: string }>;
  };
  for (const v of Object.values(snap.views ?? {})) {
    if (v.name && typeof v.definition === "string") {
      defs.set(v.name, v.definition);
    }
  }
  return defs;
}

/**
 * Reorder DROP VIEW / CREATE VIEW statements in freshly generated (not-yet-renamed)
 * migration files so that DROPs run in reverse-topological order (dependents first)
 * and CREATEs in topological order (dependencies first). Non-view statements keep
 * their original positions. No-op for files with <2 interdependent views.
 */
export function reorderViewStatements(migrationsDir: string): void {
  for (const file of readdirSync(migrationsDir)) {
    if (!file.endsWith(".sql")) continue;
    if (NEW_FORMAT.test(file)) continue; // already renamed — never touch
    if (!DRIZZLE_FORMAT.test(file)) continue; // not a freshly generated file

    const sqlPath = join(migrationsDir, file);
    const sql = readFileSync(sqlPath, "utf8");
    const reordered = reorderViewStatementsInSql(sql, () =>
      readPriorSnapshotViewDefs(migrationsDir),
    );
    if (reordered !== sql) writeFileSync(sqlPath, reordered);
  }
}

/**
 * Pure core: reorder the view statements within one migration's SQL text.
 * `getPriorDefs` lazily provides the prior snapshot's view definitions, used to
 * derive deps for pure-drop views whose body isn't in this migration. Returns a
 * byte-identical string when there's nothing to reorder.
 */
export function reorderViewStatementsInSql(
  sql: string,
  getPriorDefs: () => Map<string, string>,
): string {
  // drizzle's canonical form is `<stmt>--> statement-breakpoint\n<stmt>…`: every
  // marker is immediately followed by a newline and every statement starts on its
  // own line. Splitting on the bare marker leaves that `\n` glued to the start of
  // each following fragment, so a fragment moved to a new slot would carry/lose a
  // leading newline. Normalize each fragment (strip one surrounding newline) and
  // rejoin with a canonical `--> statement-breakpoint\n` so the invariant holds
  // regardless of which slot a statement ends up in. Preserve drizzle's optional
  // leading blank line on the very first statement.
  const rawStatements = sql.split(STATEMENT_BREAKPOINT);
  const leadingBlankLine = /^\n/.test(rawStatements[0] ?? "");
  const statements = rawStatements.map((s) =>
    // Strip a single leading newline from each fragment: for non-first fragments
    // it's the newline that followed the prior marker; for the first it's
    // drizzle's leading blank line (re-applied verbatim on rejoin). This makes
    // every fragment slot-independent.
    s.startsWith("\n") ? s.slice(1) : s,
  );

  // Classify each statement; collect the view statements with their positions.
  const viewStatements: ViewStatement[] = [];
  for (let pos = 0; pos < statements.length; pos++) {
    const text = statements[pos]!;
    const dropM = DROP_VIEW_RE.exec(text);
    if (dropM) {
      viewStatements.push({ pos, kind: "drop", view: dropM[1]!, text });
      continue;
    }
    const createM = CREATE_VIEW_RE.exec(text);
    if (createM) {
      viewStatements.push({ pos, kind: "create", view: createM[1]!, text });
    }
  }

  if (viewStatements.length < 2) return sql; // nothing to reorder

  const createdViews = new Set(
    viewStatements.filter((s) => s.kind === "create").map((s) => s.view),
  );
  const allViewNames = [...new Set(viewStatements.map((s) => s.view))];

  // Build the dependency graph: view → set of (in-migration) views it references.
  // For a view CREATEd here, parse its own CREATE body. For a pure-drop view
  // (dropped but not recreated), its body isn't in the migration — read it from
  // the prior snapshot. Candidate deps are restricted to views in this migration.
  const bodyFor = new Map<string, string>();
  for (const s of viewStatements) {
    if (s.kind === "create") bodyFor.set(s.view, s.text);
  }
  const pureDrops = allViewNames.filter((v) => !createdViews.has(v));
  if (pureDrops.length > 0) {
    const priorDefs = getPriorDefs();
    for (const v of pureDrops) {
      const def = priorDefs.get(v);
      if (def !== undefined) bodyFor.set(v, def);
    }
  }

  const deps = new Map<string, Set<string>>();
  for (const view of allViewNames) {
    const body = bodyFor.get(view);
    const set = new Set<string>();
    if (body !== undefined) {
      for (const other of allViewNames) {
        if (other === view) continue;
        // A reference is the other view's quoted name, optionally schema-qualified.
        const ref = new RegExp(
          `"${escapeRegExp(other)}"|"[^"]+"\\."${escapeRegExp(other)}"`,
        );
        if (ref.test(body)) set.add(other);
      }
    }
    deps.set(view, set);
  }

  // Compute the desired view order. CREATE in topo order (deps first); DROP in
  // reverse topo (dependents first). Both derive from the same dependency graph.
  const topo = topoSort(allViewNames, deps);
  const createOrder = topo.filter((v) => createdViews.has(v));
  const dropOrder = [...topo].reverse();

  // Reassemble: keep non-view statements in place; fill the DROP slots in
  // reverse-topo order and the CREATE slots in topo order.
  const dropPositions = viewStatements
    .filter((s) => s.kind === "drop")
    .map((s) => s.pos);
  const createPositions = viewStatements
    .filter((s) => s.kind === "create")
    .map((s) => s.pos);

  const dropTextByView = new Map(
    viewStatements
      .filter((s) => s.kind === "drop")
      .map((s) => [s.view, s.text]),
  );
  const createTextByView = new Map(
    viewStatements
      .filter((s) => s.kind === "create")
      .map((s) => [s.view, s.text]),
  );

  // Order the drop view names by the desired (reverse-topo) sequence, restricted
  // to the views actually dropped here.
  const droppedViews = dropOrder.filter((v) => dropTextByView.has(v));
  const out = [...statements];
  dropPositions.forEach((slot, i) => {
    out[slot] = dropTextByView.get(droppedViews[i]!)!;
  });
  createOrder.forEach((view, i) => {
    out[createPositions[i]!] = createTextByView.get(view)!;
  });

  // Rejoin canonically: every marker is followed by exactly one newline, so no
  // statement ever shares a line with a preceding `--> statement-breakpoint`.
  // Re-apply drizzle's optional leading blank line on the first statement.
  const body = out.join(`${STATEMENT_BREAKPOINT}\n`);
  const rejoined = leadingBlankLine ? `\n${body}` : body;
  // Byte-identical no-op guarantee: if normalization+canonical rejoin reproduced
  // the original exactly (nothing moved), return the original string untouched.
  return rejoined === sql ? sql : rejoined;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function removeGeneratedFiles(
  migrationsDir: string,
  files: string[],
): void {
  const metaDir = join(migrationsDir, "meta");
  for (const f of files) {
    if (!f.endsWith(".sql")) continue;
    rmSync(join(migrationsDir, f), { force: true });
    // Drizzle snapshot name is <prefix>_snapshot.json where <prefix> is the
    // filename up to the first underscore (the NNNN or 0NaN token).
    const idxMatch = /^([^_]+)_/.exec(f);
    if (idxMatch) {
      rmSync(join(metaDir, `${idxMatch[1]}_snapshot.json`), { force: true });
    }
    // Drop any answers sidecar keyed to this migration's tag (the .sql basename).
    rmSync(join(metaDir, answersSidecarName(f.slice(0, -4))), { force: true });
  }
}

/**
 * Discard a rejected drizzle-kit generation: remove the emitted files AND
 * restore the journal.
 *
 * The second half is not optional. drizzle-kit's `writeResult` appends to
 * `meta/_journal.json` and writes it BEFORE the `.sql`, so by the time we decide
 * to reject a generation the journal already carries a `0NaN_<name>` row.
 * `removeGeneratedFiles` deletes the `.sql`, the snapshot and the answers
 * sidecar — it has no way to know about that row, and left behind it fails
 * `migration-metadata-consistent` as an orphanJournal entry. Every caller below
 * then exits the process, so this is their only chance to leave a consistent
 * tree.
 *
 * Kept separate from `removeGeneratedFiles` rather than folded into it: that
 * function is exported and its name promises removal, nothing more.
 */
function discardGenerated(migrationsDir: string, files: string[]): void {
  removeGeneratedFiles(migrationsDir, files);
  regenerateJournal(migrationsDir);
}

function timestampNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

/** One `meta/_journal.json` entry. Deliberately carries no `idx` — see below. */
export interface JournalEntry {
  version: "7";
  when: number;
  tag: string;
  hash: string;
  breakpoints: true;
}

/**
 * Derive the journal entries for a set of migration filenames. PURE — the
 * journal is nothing but a re-encoding of the `.sql` names on disk, which is
 * exactly what makes rewriting it a safe post-condition rather than a mutation.
 *
 * Names that don't match NEW_FORMAT are ignored, agreeing with the runtime
 * runner's own MIGRATION_RE filter: a name neither can parse is inert in both,
 * and `migration-metadata-consistent`'s orphanSql is what surfaces it.
 *
 * Emits NO `idx` field, on purpose. drizzle-kit computes `idx = lastEntry.idx +
 * 1`, which against our journal is `NaN`, so it prefixes freshly generated files
 * `0NaN_` — which is precisely why DRIZZLE_FORMAT accepts `0NaN`. "Helpfully"
 * adding `idx` here would silently switch drizzle back to numbered prefixes.
 */
export function journalEntriesForSqlFiles(files: string[]): JournalEntry[] {
  return [...files]
    .filter((f) => NEW_FORMAT.test(f))
    .sort()
    .map((f) => {
      const m = NEW_FORMAT.exec(f);
      if (!m) throw new Error(`unreachable: ${f}`);
      const [, date, time, hash] = m;
      const when = Date.UTC(
        +date!.slice(0, 4),
        +date!.slice(4, 6) - 1,
        +date!.slice(6, 8),
        +time!.slice(0, 2),
        +time!.slice(2, 4),
        +time!.slice(4, 6),
      );
      return {
        version: "7" as const,
        when,
        tag: f.slice(0, -4),
        hash: hash!,
        breakpoints: true as const,
      };
    });
}

/**
 * Rewrite `meta/_journal.json` so it matches the `.sql` files on disk.
 *
 * A POST-CONDITION of the migration pipeline, never a side effect of having
 * changed something — `generateMigration` calls it unconditionally, and on an
 * already-consistent tree it rewrites byte-identical content. That is what
 * repairs a journal the `regen-migrations` merge driver resolved in main's
 * favour during a rebase; see the docblock on `generateMigration`.
 */
export function regenerateJournal(migrationsDir: string): void {
  const entries = journalEntriesForSqlFiles(readdirSync(migrationsDir));
  writeFileSync(
    join(migrationsDir, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries }, null, 2) +
      "\n",
  );
}
