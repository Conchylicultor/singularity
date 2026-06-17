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
import { libpqEnv } from "./paths";

// ─── Types for interactive prompt handling ───────────────────────────────────

export interface PromptOption {
  index: number;
  action: "create" | "rename";
  label: string;
  fromName?: string;
}

export interface DetectedPrompt {
  index: number;
  entityType: string;
  entityName: string;
  context: string | null;
  question: string;
  options: PromptOption[];
}

export type MigrationAnswer =
  | { action: "create" }
  | { action: "rename"; from: string };

/**
 * Stable identity key for a prompt, used to persist + replay the create-vs-rename
 * decision across regens (where positional order is unstable). For a column
 * prompt the table context disambiguates same-named columns across tables.
 */
export function promptKey(p: DetectedPrompt): string {
  if (p.entityType === "column") return `column:${p.context}.${p.entityName}`;
  return `${p.entityType}:${p.entityName}`;
}

/**
 * One persisted answer in a `meta/<tag>_answers.json` sidecar. Carries the
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

export interface DrizzlePromptResult {
  exitCode: number;
  stdoutBuf: string;
  stderrBuf: string;
  detectedPrompts: DetectedPrompt[];
  /** Prompt keys (promptKey) drizzle showed that had no persisted answer, or
   * whose rename source was missing. Empty unless keyedAnswers was supplied. */
  unanswered: string[];
}

/**
 * Read every branch-local `meta/*_answers.json` sidecar (those whose migration
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
    if (!f.endsWith("_answers.json")) continue;
    // A sidecar <tag>_answers.json maps to migration <tag>.sql; skip sidecars
    // whose migration is already on main (their answers are immutable history).
    const sqlBasename = `${f.slice(0, -"_answers.json".length)}.sql`;
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
 * Write a `meta/<schemaTag>_answers.json` sidecar capturing the resolved
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
    join(metaDir, `${schemaTag}_answers.json`),
    JSON.stringify(sidecar, null, 2) + "\n",
  );
}

// ─── ANSI / prompt parsing utilities ─────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(?:\[[0-9;]*[a-zA-Z]|\[\?[0-9;]*[a-zA-Z]|\][^\x07]*\x07|[()][AB012])/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

const QUESTION_COL_RE =
  /Is (.+?) column in (.+?) table created or renamed from another column/;
const QUESTION_ENTITY_RE =
  /Is (.+?) (table|schema|enum|view|sequence|role|policy) created or renamed/;
const OPTION_CREATE_RE = /[❯ ]\s*\+\s*(.+?)\s+create\s/;
const OPTION_RENAME_RE = /[❯ ]\s*~\s*(.+?)\s*›\s*(.+?)\s+rename\s/;
const CONFIRMATION_RE = /will be (created|renamed|renamed\/moved)/;

interface ParsedQuestion {
  entityType: string;
  entityName: string;
  context: string | null;
  question: string;
}

function tryParseQuestion(line: string): ParsedQuestion | null {
  const colMatch = QUESTION_COL_RE.exec(line);
  if (colMatch) {
    return {
      entityType: "column",
      entityName: colMatch[1]!,
      context: colMatch[2]!,
      question: line.trim(),
    };
  }
  const entityMatch = QUESTION_ENTITY_RE.exec(line);
  if (entityMatch) {
    return {
      entityType: entityMatch[2]!,
      entityName: entityMatch[1]!,
      context: null,
      question: line.trim(),
    };
  }
  return null;
}

function tryParseOption(
  line: string,
  index: number,
): PromptOption | null {
  const createMatch = OPTION_CREATE_RE.exec(line);
  if (createMatch) {
    return { index, action: "create", label: `+ ${createMatch[1]!.trim()}` };
  }
  const renameMatch = OPTION_RENAME_RE.exec(line);
  if (renameMatch) {
    return {
      index,
      action: "rename",
      label: `~ ${renameMatch[1]!.trim()} › ${renameMatch[2]!.trim()}`,
      fromName: renameMatch[1]!.trim(),
    };
  }
  return null;
}

function keystrokesForOptionIndex(optionIndex: number): Uint8Array {
  const parts: number[] = [];
  for (let i = 0; i < optionIndex; i++) parts.push(0x1b, 0x5b, 0x42); // arrow-down
  parts.push(0x0d); // enter
  return new Uint8Array(parts);
}

/**
 * Resolve an answer to an option index, or `null` if it can't be satisfied
 * (a rename whose source isn't among the prompt's options — e.g. consumed by a
 * prior rename, or no longer present after a rebase). The non-throwing core so
 * the keyed (regen) path can record a gap instead of using exceptions for flow.
 */
function tryResolveAnswer(
  prompt: DetectedPrompt,
  answer: MigrationAnswer,
): number | null {
  if (answer.action === "create") return 0;
  const idx = prompt.options.findIndex(
    (o) => o.action === "rename" && o.fromName === answer.from,
  );
  return idx === -1 ? null : idx;
}

export function resolveAnswer(
  prompt: DetectedPrompt,
  answer: MigrationAnswer,
): number {
  const idx = tryResolveAnswer(prompt, answer);
  if (idx === null) {
    // tryResolveAnswer only returns null for a rename whose source is missing —
    // "create" always resolves to option 0. Narrow for the diagnostic.
    const from = answer.action === "rename" ? answer.from : "";
    const available = prompt.options.map((o) => o.label).join(", ");
    throw new Error(
      `Answer specifies rename from "${from}" but prompt for ` +
        `"${prompt.entityName}" only has options: [${available}].\n` +
        `The source may have been consumed by a prior rename answer.\n\n` +
        `AGENT: Stop here and report this error to the user. Do not retry ` +
        `without understanding why the expected rename source is missing.`,
    );
  }
  return idx;
}

// ─── Core runner ─────────────────────────────────────────────────────────────

/**
 * Run drizzle-kit with interactive prompt handling.
 *
 * - answers=null (detect mode): advances each prompt with "create" (option 0)
 *   to discover all prompts. The caller must discard any generated files.
 * - answers=[...] (answer mode): uses the provided semantic answers to select
 *   the correct option for each prompt.
 */
export async function runDrizzleKitWithPrompts(opts: {
  cmd: string[];
  cwd: string;
  env: Record<string, string>;
  answers: MigrationAnswer[] | null;
  /**
   * Identity-keyed answers (used by regen, where positional order is unstable).
   * Takes precedence over `answers`: when set, positional `answers` is ignored
   * and each prompt is resolved by its promptKey. Missing keys (or a stale
   * rename source) are pushed onto the returned `unanswered` and advanced with
   * option 0 so discovery continues rather than killing the process.
   */
  keyedAnswers?: Map<string, MigrationAnswer>;
  /** If true, echo stdout/stderr to the parent process streams. */
  echo?: boolean;
}): Promise<DrizzlePromptResult> {
  const { cmd, cwd, env, answers, keyedAnswers, echo = false } = opts;

  const proc = Bun.spawn(cmd, {
    cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...env, NO_COLOR: "1" },
  });

  const detectedPrompts: DetectedPrompt[] = [];
  const unanswered: string[] = [];
  let promptIndex = 0;
  let awaitingConfirmation = false;
  let currentQuestion: ParsedQuestion | null = null;
  let currentOptions: PromptOption[] = [];

  function flushPrompt(stdin: typeof proc.stdin) {
    if (!currentQuestion || currentOptions.length === 0) return;
    const prompt: DetectedPrompt = {
      index: promptIndex,
      entityType: currentQuestion.entityType,
      entityName: currentQuestion.entityName,
      context: currentQuestion.context,
      question: currentQuestion.question,
      options: currentOptions,
    };
    detectedPrompts.push(prompt);

    let optIdx = 0;
    if (keyedAnswers) {
      // Keyed (regen) mode: resolve by entity identity, not position. Missing or
      // unresolvable answers don't kill the process — we record them and keep
      // discovering with option 0 so the caller can report every gap at once and
      // discard the generated files.
      const a = keyedAnswers.get(promptKey(prompt));
      const idx = a === undefined ? null : tryResolveAnswer(prompt, a);
      if (idx === null) {
        unanswered.push(promptKey(prompt));
        optIdx = 0;
      } else {
        optIdx = idx;
      }
    } else if (answers) {
      if (promptIndex >= answers.length) {
        console.error(
          `\nError: drizzle-kit showed prompt ${promptIndex + 1} but only ` +
            `${answers.length} answer(s) were provided.\n` +
            `Re-run without --migration-answers to discover all prompts.\n\n` +
            `AGENT: Stop here and report this limitation to the user. The ` +
            `number of prompts exceeded the provided answers. Do not retry ` +
            `without first re-running in detect mode.`,
        );
        proc.kill();
        return;
      }
      try {
        optIdx = resolveAnswer(prompt, answers[promptIndex]!);
      } catch (e: unknown) {
        console.error(`\n${e instanceof Error ? e.message : String(e)}`);
        proc.kill();
        return;
      }
    }

    void stdin.write(keystrokesForOptionIndex(optIdx));
    awaitingConfirmation = true;
    promptIndex++;
    currentQuestion = null;
    currentOptions = [];
  }

  let stdoutBuf = "";
  let strippedBuf = "";
  let processedUpTo = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function tryFlushAfterDelay() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      if (currentQuestion && currentOptions.length > 0 && !awaitingConfirmation) {
        flushPrompt(proc.stdin);
      }
    }, 100);
  }

  function processBuffer() {
    const unprocessed = strippedBuf.slice(processedUpTo);
    const lines = unprocessed.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      if (awaitingConfirmation) {
        if (CONFIRMATION_RE.test(line)) {
          awaitingConfirmation = false;
        }
        continue;
      }

      const q = tryParseQuestion(line);
      if (q) {
        if (currentQuestion && currentOptions.length > 0) {
          flushPrompt(proc.stdin);
        }
        currentQuestion = q;
        currentOptions = [];
        continue;
      }

      if (currentQuestion) {
        const opt = tryParseOption(line, currentOptions.length);
        if (opt) {
          currentOptions.push(opt);
          tryFlushAfterDelay();
        } else if (currentOptions.length > 0) {
          flushPrompt(proc.stdin);
        }
      }
    }
    processedUpTo = strippedBuf.length;
  }

  const stdoutDone = (async () => {
    const decoder = new TextDecoder();
    const reader = proc.stdout.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (echo) process.stdout.write(value);
      stdoutBuf += chunk;
      strippedBuf += stripAnsi(chunk);
      processBuffer();
    }
    stdoutBuf += decoder.decode();

    if (flushTimer) clearTimeout(flushTimer);
    if (currentQuestion && currentOptions.length > 0 && !awaitingConfirmation) {
      flushPrompt(proc.stdin);
    }
  })();

  let stderrBuf = "";
  const stderrDone = (async () => {
    const decoder = new TextDecoder();
    const reader = proc.stderr.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (echo) process.stderr.write(value);
      stderrBuf += decoder.decode(value, { stream: true });
    }
    stderrBuf += decoder.decode();
  })();

  const exitCode = await proc.exited;
  await Promise.all([stdoutDone, stderrDone]);

  return { exitCode, stdoutBuf, stderrBuf, detectedPrompts, unanswered };
}

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

/**
 * Run `drizzle-kit generate`; detect whether it produced a new migration;
 * require --migration-name when it did; rename new files to the hash-based
 * format and regenerate the journal. Exits the process on error.
 *
 * When drizzle-kit shows interactive rename/create prompts:
 * - Without migrationAnswers: discovers all prompts (auto-advancing with
 *   "create"), discards generated files, prints structured JSON, exits 2.
 * - With migrationAnswers: uses the provided semantic answers and proceeds.
 */
export async function generateMigration(opts: {
  root: string;
  worktreeName: string;
  migrationName?: string;
  resetMigration?: boolean;
  customMigration?: boolean;
  migrationAnswers?: MigrationAnswer[];
}): Promise<void> {
  const { root, worktreeName, migrationName, resetMigration, customMigration, migrationAnswers } = opts;

  if (migrationName && !MIGRATION_NAME_REGEX.test(migrationName)) {
    console.error(
      `Invalid --migration-name "${migrationName}". Use lowercase letters, digits, and underscores only.`,
    );
    process.exit(1);
  }

  const migrationsDir = resolve(root, "plugins/database/plugins/migrations/data");

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

  const before = new Set(readdirSync(migrationsDir));

  // `bunx` falls back to Node when the binary's shebang is `#!/usr/bin/env node`
  // (drizzle-kit ships exactly that). Once Node owns the process, transitive
  // imports through plugin barrels can pull in `paths/bins.ts`, which calls
  // `Bun.which()` and crashes with "Bun is not defined" — silently exit-0,
  // no migration generated. `--bun` forces Bun runtime regardless of shebang.
  const cmd = [process.execPath, "x", "--bun", "drizzle-kit", "generate"];
  if (customMigration) cmd.push("--custom");
  if (migrationName) cmd.push("--name", migrationName);

  const cwd = resolve(root, "plugins/database/plugins/migrations");
  const result = await runDrizzleKitWithPrompts({
    cmd,
    cwd,
    env: {
      ...process.env,
      ...libpqEnv(),
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

  // INVARIANT: never keep a migration generated with prompts unless answers were
  // provided. In keyed (regen) mode `migrationAnswers` is undefined but answers
  // come from the sidecar map — so exclude keyed mode here; its own unanswered
  // check below handles the abort.
  if (result.detectedPrompts.length > 0 && !migrationAnswers && !keyedAnswers) {
    const added = readdirSync(migrationsDir).filter(
      (f: string) => f.endsWith(".sql") && !before.has(f),
    );
    removeGeneratedFiles(migrationsDir, added);
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
    removeGeneratedFiles(migrationsDir, added);
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
    return;
  }

  if (!migrationName) {
    removeGeneratedFiles(migrationsDir, added);
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
      console.log(`  wrote answers sidecar ${schemaTag}_answers.json`);
    }
  }
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
 */
async function rehashBranchLocalDataMigrations(
  root: string,
  migrationsDir: string,
): Promise<void> {
  const ref = await resolveRef(root);
  if (!ref) return; // can't determine the branch-local set; leave files untouched
  const tracked = await listTrackedMigrationBasenames(root, ref);
  const metaDir = join(migrationsDir, "meta");

  let renamed = false;
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
    renamed = true;
  }
  if (renamed) regenerateJournal(migrationsDir);
}

/**
 * Delete migration files that exist in the working tree but not at
 * `origin/main` (or local `main` as fallback). Used by `--reset-migration`
 * to recover from a snapshot-chain Y-fork after rebasing onto main: the
 * branch-local migration is dropped so drizzle-kit can re-emit a fresh one
 * against the rebased tip.
 *
 * Only ever touches files absent from the chosen ref, so a shared migration
 * cannot be removed by accident. After deletion, regenerates the journal so
 * drizzle-kit's "latest snapshot" lookup matches what's left on disk.
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
    rmSync(join(metaDir, `${f.slice(0, -4)}_answers.json`), { force: true });
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
  // Rewrite _journal.json so it matches the (now reduced) set of .sql files
  // on disk. Drizzle reads journal entries to pick the "latest snapshot"
  // when generating; a stale entry pointing at a just-deleted file would
  // make it skip our reset.
  regenerateJournal(migrationsDir);
}

async function resolveRef(root: string): Promise<string | null> {
  for (const ref of ["origin/main", "main"]) {
    const proc = Bun.spawn(["git", "rev-parse", "--verify", ref], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    if ((await proc.exited) === 0) return ref;
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
  const proc = Bun.spawn(
    [
      "git",
      "ls-tree",
      "-r",
      "--name-only",
      ref,
      "--",
      "plugins/database/plugins/migrations/data",
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) return new Set();
  return new Set(
    out
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
const DROP_VIEW_RE = /^\s*DROP\s+(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+EXISTS\s+)?(?:"[^"]+"\.)?"([^"]+)"/i;
// CREATE [OR REPLACE] [MATERIALIZED] VIEW "schema"."name" AS … — capture the name.
const CREATE_VIEW_RE = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:"[^"]+"\.)?"([^"]+)"/i;

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
 * `{ name, definition, … }`). The prior snapshot is the latest one already in
 * the journal — drizzle has written the NEW snapshot as `meta/NNNN_snapshot.json`
 * but has NOT yet appended it to `_journal.json` (we regenerate the journal later
 * in renameMigrations), so the journal's last entry is the prior one.
 */
function readPriorSnapshotViewDefs(
  migrationsDir: string,
): Map<string, string> {
  const defs = new Map<string, string>();
  const metaDir = join(migrationsDir, "meta");
  const journalPath = join(metaDir, "_journal.json");
  if (!existsSync(journalPath)) return defs;

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries?: Array<{ tag: string }>;
  };
  const lastTag = journal.entries?.at(-1)?.tag;
  if (!lastTag) return defs;

  const snapPath = join(metaDir, `${lastTag}_snapshot.json`);
  if (!existsSync(snapPath)) return defs;

  const snap = JSON.parse(readFileSync(snapPath, "utf8")) as {
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
    viewStatements.filter((s) => s.kind === "drop").map((s) => [s.view, s.text]),
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
    rmSync(join(metaDir, `${f.slice(0, -4)}_answers.json`), { force: true });
  }
}

function timestampNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

function regenerateJournal(migrationsDir: string): void {
  const metaDir = join(migrationsDir, "meta");
  const files = readdirSync(migrationsDir)
    .filter((f: string) => NEW_FORMAT.test(f))
    .sort();

  const entries = files.map((f: string) => {
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
      version: "7",
      when,
      tag: f.slice(0, -4),
      hash,
      breakpoints: true,
    };
  });

  writeFileSync(
    join(metaDir, "_journal.json"),
    JSON.stringify(
      { version: "7", dialect: "postgresql", entries },
      null,
      2,
    ) + "\n",
  );
}
