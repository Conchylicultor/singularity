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

export interface DrizzlePromptResult {
  exitCode: number;
  stdoutBuf: string;
  stderrBuf: string;
  detectedPrompts: DetectedPrompt[];
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
      entityName: colMatch[1],
      context: colMatch[2],
      question: line.trim(),
    };
  }
  const entityMatch = QUESTION_ENTITY_RE.exec(line);
  if (entityMatch) {
    return {
      entityType: entityMatch[2],
      entityName: entityMatch[1],
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
    return { index, action: "create", label: `+ ${createMatch[1].trim()}` };
  }
  const renameMatch = OPTION_RENAME_RE.exec(line);
  if (renameMatch) {
    return {
      index,
      action: "rename",
      label: `~ ${renameMatch[1].trim()} › ${renameMatch[2].trim()}`,
      fromName: renameMatch[1].trim(),
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

function resolveAnswer(
  prompt: DetectedPrompt,
  answer: MigrationAnswer,
): number {
  if (answer.action === "create") return 0;
  const idx = prompt.options.findIndex(
    (o) => o.action === "rename" && o.fromName === answer.from,
  );
  if (idx === -1) {
    const available = prompt.options.map((o) => o.label).join(", ");
    throw new Error(
      `Answer specifies rename from "${answer.from}" but prompt for ` +
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
  /** If true, echo stdout/stderr to the parent process streams. */
  echo?: boolean;
}): Promise<DrizzlePromptResult> {
  const { cmd, cwd, env, answers, echo = false } = opts;

  const proc = Bun.spawn(cmd, {
    cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...env, NO_COLOR: "1" },
  });

  const detectedPrompts: DetectedPrompt[] = [];
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
    if (answers) {
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
        optIdx = resolveAnswer(prompt, answers[promptIndex]);
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

  return { exitCode, stdoutBuf, stderrBuf, detectedPrompts };
}

const NEW_FORMAT = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;
// Drizzle-kit normally numbers files (0000, 0001, …) but emits "0NaN" when
// it can't derive the next index from existing (non-matching) filenames.
const DRIZZLE_FORMAT = /^(\d{4}|0NaN)_(.+)\.sql$/;
const MIGRATION_NAME_REGEX = /^[a-z0-9_]+$/;

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

  if (resetMigration) {
    await resetBranchLocalMigrations(root, migrationsDir);
  }

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

  // INVARIANT: never keep a migration generated with prompts unless agent
  // explicitly provided answers.
  if (result.detectedPrompts.length > 0 && !migrationAnswers) {
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

  const renameResult = renameMigrations(migrationsDir);
  for (const r of renameResult.renamed) {
    console.log(`  ${r.from} → ${r.to}`);
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
    rmSync(join(migrationsDir, f), { force: true });
    removed.push(f);
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
    const sql = readFileSync(sqlPath, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex").slice(0, 8);
    const ts = timestampNow();
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
      +date.slice(0, 4),
      +date.slice(4, 6) - 1,
      +date.slice(6, 8),
      +time.slice(0, 2),
      +time.slice(2, 4),
      +time.slice(4, 6),
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
