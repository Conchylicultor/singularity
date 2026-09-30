/**
 * The migration half of the clone journey: a clone that lands its OWN schema
 * migrations and then takes upstream updates that carry upstream's, driven
 * through the real CLI against a copy of this very tree.
 *
 * Why a copy of the real tree rather than a text fixture: drizzle-kit reads the
 * real schema files, the real snapshot chain and the real phased-migration
 * grammar, so only the real tree exercises what a clone user's push and update
 * actually do. Plan: `research/2026-09-30-global-clone-migrations-published-set.md` §5.
 *
 * The repositories, all under the caller's temp dir:
 *
 *   upstream/      `git clone --shared` of THIS checkout, its `main` = this
 *                  checkout's HEAD plus (unless `--pristine`) its uncommitted
 *                  working-tree state, committed there as one overlay commit —
 *                  nothing in a worktree is committed until push, so HEAD alone
 *                  would test yesterday's code. No remote: it is the author.
 *   clone/         `git clone` of upstream that KEEPS the remote name `origin`
 *                  — what `install.sh` / `git clone` leave, and the shape in
 *                  which `origin/main` is the AUTHOR's main (Problem 1).
 *   <name>-up/     linked worktree of upstream on `main`: where upstream works.
 *   <name>-clone/  linked worktree of clone: where the clone's branches live.
 *
 * Every `./singularity` call runs in one of the two LINKED worktrees, never in
 * a repo's main checkout: a main checkout mints the namespace `singularity`,
 * which is the real main app's, and an op there would show on main's banner.
 * The linked worktrees get unique names so their namespaces are their own.
 *
 * PUSH IS EMULATED, not run, and on purpose. The real `./singularity push`
 * holds the host-wide push mutex (every agent on the machine queues behind
 * it), writes op markers, and runs the full `--scope tree` check pass — which
 * includes `migration-applies-clean` against the real main database and
 * `fork-schema-drift` against the real main worktree. None of that is hermetic.
 * `landingPrep` / `fastForwardMain` below replay exactly the steps of push's
 * worktree path that decide what lands in `migrations/data` (run.ts steps 3,
 * 3c and 6): the three-armed landing (amend-only when the branch contains main,
 * refuse merges main moved past, else `rebase main --exec` the trailer), the
 * FORCED normalize (`./singularity regen-migrations`, then amend the head), and
 * the fast-forward of `main`. It skips `regen-generated` (docs and registries —
 * nothing a migration assertion reads), the install (the worktree already has
 * this lockfile), the checks, and every network step (the clone is `local`).
 *
 * Assertions are on git state and generated files only. No database is touched:
 * the database consequence of a renamed migration (the runner re-applies DDL
 * keyed by the new sha8) is mechanical and covered by the runner's own tests.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { resolvePublishTarget } from "@plugins/infra/plugins/git/plugins/remotes/core";
import {
  checkoutNamespace,
  worktreeDataDir,
} from "@plugins/infra/plugins/paths/core";
import {
  spawnCaptured,
  type SpawnResult,
} from "@plugins/infra/plugins/spawn/core";

export type Check = (label: string, ok: boolean, detail?: string) => void;

const DATA = "plugins/database/plugins/migrations/data";
const META = `${DATA}/meta`;
const JOURNAL = "_journal.json";

/** Probe schema files: matched by drizzle.config's `tables-*.ts` glob. */
const UPSTREAM_PROBE =
  "plugins/upstream/server/internal/tables-e2e-upstream.ts";
const CLONE_PROBE = "plugins/upstream/server/internal/tables-e2e-clone.ts";
const UPSTREAM_TABLE = "e2e_upstream_probe";

const GIT_TIMEOUT_MS = 120_000;
/**
 * Every `./singularity` call. The first one in each worktree installs that
 * worktree's dependencies (a cold `bun install` plus provisions), and each
 * regen loads every schema file through drizzle-kit — minutes, not seconds.
 */
const CLI_TIMEOUT_MS = 20 * 60_000;

/** A named failure of the FIXTURE (not a test result): stops the phase. */
class HarnessError extends Error {}

interface Ctx {
  tmp: string;
  source: string;
  upstream: string;
  clone: string;
  upWt: string;
  cloneWt: string;
  logDir: string;
  check: Check;
  cliSeq: number;
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t.t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t.t",
};

async function gitRaw(cwd: string, args: string[]): Promise<SpawnResult> {
  return await spawnCaptured(["git", ...args], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
    env: { ...process.env, ...GIT_ENV },
  });
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const r = await gitRaw(cwd, args);
  if (r.exitCode !== 0) {
    throw new HarnessError(
      `git ${args.join(" ")} failed in ${cwd} (exit ${r.exitCode}):\n${r.stderr}`,
    );
  }
  return r.stdout.trim();
}

async function isAncestor(cwd: string, a: string, b: string): Promise<boolean> {
  const r = await gitRaw(cwd, ["merge-base", "--is-ancestor", a, b]);
  if (r.exitCode === 0) return true;
  if (r.exitCode === 1) return false;
  throw new HarnessError(`merge-base --is-ancestor ${a} ${b}: ${r.stderr}`);
}

/**
 * `./singularity <args>` in `cwd`, captured, full output kept in the log dir.
 *
 * `SINGULARITY_DEPS_REEXEC` is dropped from the child's env: this process was
 * itself started through `./singularity run`, and inheriting the bootstrap's
 * re-exec marker would make a child that just installed skip the re-exec its
 * stale module resolver needs.
 */
async function cli(
  ctx: Ctx,
  cwd: string,
  args: string[],
): Promise<SpawnResult> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...GIT_ENV,
  };
  delete env.SINGULARITY_DEPS_REEXEC;
  const started = Date.now();
  const r = await spawnCaptured(["./singularity", ...args], {
    cwd,
    env,
    timeoutMs: CLI_TIMEOUT_MS,
  });
  ctx.cliSeq += 1;
  const log = join(
    ctx.logDir,
    `${String(ctx.cliSeq).padStart(2, "0")}-${args.join("_").replace(/[^\w.-]+/g, "-")}.log`,
  );
  writeFileSync(
    log,
    `$ (cd ${cwd} && ./singularity ${args.join(" ")})\nexit ${r.exitCode}${r.timedOut ? " (TIMED OUT)" : ""}\n\n--- stdout\n${r.stdout}\n--- stderr\n${r.stderr}`,
  );
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `    $ ./singularity ${args.join(" ")}  → exit ${r.exitCode} (${secs}s, ${log})`,
  );
  if (r.timedOut)
    throw new HarnessError(`./singularity ${args.join(" ")} timed out`);
  return r;
}

/** The last `n` non-empty lines of a run's combined output, for a check detail. */
function tail(r: SpawnResult, n = 15): string {
  const lines = `${r.stdout}\n${r.stderr}`
    .split("\n")
    .filter((l) => l.trim().length > 0);
  return `\n      ${lines.slice(-n).join("\n      ")}`;
}

// --- migration-file reads -----------------------------------------------------

/** Every migration file under data/ (and meta/) at `ref`, path → blob sha. */
async function filesAt(cwd: string, ref: string): Promise<Map<string, string>> {
  const out = await git(cwd, "ls-tree", "-r", ref, "--", DATA);
  const map = new Map<string, string>();
  for (const line of out.split("\n").filter(Boolean)) {
    // "<mode> blob <sha>\t<path>"
    const [meta, path] = line.split("\t");
    const sha = meta!.split(" ")[2]!;
    if (path!.endsWith(JOURNAL)) continue;
    map.set(path!, sha);
  }
  return map;
}

/** The same, read from the working tree (blob shas via `git hash-object`). */
async function filesOnDisk(cwd: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const paths: string[] = [];
  for (const f of readdirSync(join(cwd, DATA))) {
    if (f.endsWith(".sql")) paths.push(`${DATA}/${f}`);
  }
  for (const f of readdirSync(join(cwd, META))) {
    if (f !== JOURNAL && f.endsWith(".json")) paths.push(`${META}/${f}`);
  }
  if (paths.length === 0) return map;
  const shas = (await git(cwd, "hash-object", "--", ...paths)).split("\n");
  paths.forEach((p, i) => map.set(p, shas[i]!));
  return map;
}

/** Files in `after` that are absent from `before` (added, by path). */
function added(
  before: Map<string, string>,
  after: Map<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [p, sha] of after) if (!before.has(p)) out.set(p, sha);
  return out;
}

const sqlOf = (files: Map<string, string>): string[] =>
  [...files.keys()].filter((p) => p.endsWith(".sql")).sort();

const basename = (p: string): string => p.split("/").pop()!;

/**
 * Which of `expected` (published path → blob sha) the working tree no longer
 * holds byte-identically: deleted, renamed, or rewritten. Empty = all intact.
 */
async function notIntact(
  cwd: string,
  expected: Map<string, string>,
): Promise<string[]> {
  const disk = await filesOnDisk(cwd);
  const bad: string[] = [];
  for (const [p, sha] of expected) {
    const got = disk.get(p);
    if (got === undefined) bad.push(`${basename(p)} (missing)`);
    else if (got !== sha) bad.push(`${basename(p)} (content changed)`);
  }
  return bad;
}

/** A fingerprint of the whole data dir (journal included), for "emitted nothing". */
function dataFingerprint(cwd: string): string {
  const h = createHash("sha256");
  for (const dir of [DATA, META]) {
    for (const f of readdirSync(join(cwd, dir)).sort()) {
      if (dir === DATA && f === "meta") continue;
      h.update(`${dir}/${f}\0`);
      h.update(readFileSync(join(cwd, dir, f)));
    }
  }
  return h.digest("hex");
}

function write(root: string, rel: string, body: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
}

function probeSource(
  constName: string,
  table: string,
  note?: "text" | "integer",
): string {
  const imports =
    note === "integer" ? "integer, pgTable, text" : "pgTable, text";
  const noteCol = note ? `\n  note: ${note}("note"),` : "";
  return (
    `import { ${imports} } from "drizzle-orm/pg-core";\n\n` +
    `// Throwaway probe table of plugins/upstream/e2e/clone-journey.ts. It exists\n` +
    `// only in that e2e's temp repositories and never lands anywhere else.\n` +
    `export const ${constName} = pgTable("${table}", {\n` +
    `  id: text("id").primaryKey(),${noteCol}\n` +
    `});\n`
  );
}

// --- the emulated push (see the module docblock for why) -----------------------

/**
 * Push's landing steps up to (not including) the fast-forward: make the branch
 * land as a fast-forward of `main` and run the forced normalize. Returns the
 * normalize's result so a caller can inspect what it did before anything lands.
 */
async function landingPrep(
  ctx: Ctx,
  wt: string,
  branch: string,
): Promise<SpawnResult> {
  const pushId = randomBytes(8).toString("hex");
  const trailer = `git -c trailer.ifexists=replace commit --amend --no-edit --trailer Singularity-Push=${pushId}`;
  const commits = Number(await git(wt, "rev-list", "--count", "main..HEAD"));
  if (await isAncestor(wt, "main", "HEAD")) {
    // Arm 1: already contains main — amend the trailer onto the tip only.
    if (commits > 0) await git(wt, ...trailer.split(" ").slice(1));
  } else {
    const merges = (await git(wt, "rev-list", "--merges", "main..HEAD"))
      .split("\n")
      .filter(Boolean).length;
    // Arm 2: push refuses to flatten merges main has moved past.
    if (merges > 0) {
      throw new HarnessError(
        `${branch}: merge commits on a branch main moved past — push would refuse`,
      );
    }
    // Arm 3: rebase onto main, stamping every replayed commit.
    await git(wt, "rebase", "main", "--exec", trailer);
  }
  // 3c. The FORCED normalize: `force: true` runs `regen-migrations` whether or
  // not a merge marker arrived, then amends whatever it changed into the head.
  const normalize = await cli(ctx, wt, ["regen-migrations"]);
  if (normalize.exitCode === 0 && (await git(wt, "status", "--porcelain"))) {
    await git(wt, "add", "-A");
    await git(wt, "commit", "--amend", "--no-edit");
  }
  return normalize;
}

/** Push step 6: `main` fast-forwards to the branch (never anything else). */
async function fastForwardMain(wt: string, branch: string): Promise<void> {
  if (!(await isAncestor(wt, "main", branch))) {
    throw new HarnessError(
      `main is not an ancestor of ${branch}: no fast-forward`,
    );
  }
  const old = await git(wt, "rev-parse", "main");
  await git(wt, "update-ref", "refs/heads/main", branch, old);
}

async function commitAll(wt: string, message: string): Promise<void> {
  await git(wt, "add", "-A");
  await git(wt, "commit", "-q", "-m", message);
}

// --- fixture ------------------------------------------------------------------

/**
 * Bring `upWt` (on upstream's `main`) to the SOURCE checkout's working-tree
 * state: tracked changes via a binary diff, untracked (not ignored) files
 * copied, committed as one overlay commit.
 */
async function overlaySourceWorkingTree(ctx: Ctx): Promise<number> {
  const diff = await spawnCaptured(["git", "diff", "HEAD", "--binary"], {
    cwd: ctx.source,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  if (diff.exitCode !== 0)
    throw new HarnessError(`git diff HEAD: ${diff.stderr}`);
  if (diff.stdout.trim()) {
    const patch = join(ctx.tmp, "overlay.patch");
    writeFileSync(patch, diff.stdoutBytes);
    await git(ctx.upWt, "apply", "--binary", patch);
  }
  const untracked = (
    await spawnCaptured(
      ["git", "ls-files", "--others", "--exclude-standard", "-z"],
      {
        cwd: ctx.source,
        timeoutMs: GIT_TIMEOUT_MS,
      },
    )
  ).stdout
    .split("\0")
    .filter(Boolean);
  for (const rel of untracked) {
    mkdirSync(dirname(join(ctx.upWt, rel)), { recursive: true });
    cpSync(join(ctx.source, rel), join(ctx.upWt, rel));
  }
  const changed = (await git(ctx.upWt, "status", "--porcelain"))
    .split("\n")
    .filter(Boolean).length;
  if (changed > 0)
    await commitAll(ctx.upWt, "e2e: overlay the source working tree");
  return changed;
}

/** The three merge drivers `build` registers (register-merge-drivers.ts). */
async function registerMergeDrivers(repo: string): Promise<void> {
  for (const name of [
    "regen-generated",
    "regen-claudemd",
    "regen-migrations",
  ]) {
    await git(
      repo,
      "config",
      "--local",
      `merge.${name}.driver`,
      `plugins/framework/plugins/cli/scripts/${name}.sh %O %A %B %P`,
    );
  }
}

/**
 * The first CLI call in a fresh worktree installs its dependencies. Done once,
 * up front, so the install's time is not charged to an assertion — and so a
 * lockfile the install rewrote is caught here, as the fixture fault it is,
 * rather than read later as a dirty tree by `upstream merge`.
 */
async function warm(ctx: Ctx, wt: string): Promise<void> {
  const r = await cli(ctx, wt, ["check", "--list"]);
  if (r.exitCode !== 0)
    throw new HarnessError(`warm-up failed in ${wt}:${tail(r)}`);
  const dirty = await git(wt, "status", "--porcelain");
  if (dirty)
    throw new HarnessError(`the dependency install dirtied ${wt}:\n${dirty}`);
}

async function setUp(ctx: Ctx, pristine: boolean): Promise<void> {
  // upstream: this checkout's objects, its HEAD as `main`, no remote.
  await git(
    ctx.tmp,
    "clone",
    "-q",
    "--shared",
    "--no-checkout",
    ctx.source,
    ctx.upstream,
  );
  const head = await git(ctx.source, "rev-parse", "HEAD");
  await git(ctx.upstream, "branch", "-f", "main", head);
  // The main checkout parks on an unborn branch so `main` is free to be checked
  // out in the linked worktree (a repo's main checkout is never a CLI cwd).
  await git(ctx.upstream, "symbolic-ref", "HEAD", "refs/heads/e2e-parked");
  await git(ctx.upstream, "remote", "remove", "origin");
  for (const b of (
    await git(
      ctx.upstream,
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
    )
  )
    .split("\n")
    .filter((b) => b && b !== "main")) {
    await git(ctx.upstream, "branch", "-q", "-D", b);
  }
  await git(ctx.upstream, "worktree", "add", "-q", ctx.upWt, "main");
  await git(ctx.upstream, "config", "--local", "user.name", "upstream");
  await git(
    ctx.upstream,
    "config",
    "--local",
    "user.email",
    "upstream@e2e.invalid",
  );

  if (pristine) {
    console.log(
      `  --pristine: upstream main = ${head.slice(0, 10)} (committed HEAD only)`,
    );
  } else {
    const n = await overlaySourceWorkingTree(ctx);
    console.log(
      `  upstream main = ${head.slice(0, 10)} + ${n} uncommitted path(s) of this checkout`,
    );
  }

  // clone: keeps `origin` — the real-clone shape.
  await git(ctx.tmp, "clone", "-q", "--no-checkout", ctx.upstream, ctx.clone);
  await git(ctx.clone, "branch", "-f", "main", "origin/main");
  await git(ctx.clone, "symbolic-ref", "HEAD", "refs/heads/e2e-parked");
  await git(ctx.clone, "config", "--local", "user.name", "clone");
  await git(ctx.clone, "config", "--local", "user.email", "clone@e2e.invalid");
  await registerMergeDrivers(ctx.clone);
  // Record the write probe's "no" for this URL, exactly as a denied probe
  // would (remotes/core/internal/cache.ts). A local-path remote would ACCEPT a
  // dry-run push, so without this the clone would think it may publish.
  const url = await git(ctx.clone, "remote", "get-url", "origin");
  await git(
    ctx.clone,
    "config",
    "--local",
    "singularity.publish.remote",
    "none",
  );
  await git(ctx.clone, "config", "--local", "singularity.publish.url", url);
  await git(
    ctx.clone,
    "worktree",
    "add",
    "-q",
    "--detach",
    ctx.cloneWt,
    "main",
  );

  console.log(
    "  installing dependencies in both worktrees (slow on first run)...",
  );
  await warm(ctx, ctx.upWt);
  await warm(ctx, ctx.cloneWt);
}

// --- the journey ----------------------------------------------------------------

export interface MigrationJourneyOptions {
  tmp: string;
  source: string;
  pristine: boolean;
  check: Check;
}

export async function runMigrationJourney(
  opts: MigrationJourneyOptions,
): Promise<void> {
  const id = randomBytes(3).toString("hex");
  const ctx: Ctx = {
    tmp: opts.tmp,
    source: opts.source,
    upstream: join(opts.tmp, "upstream"),
    clone: join(opts.tmp, "clone"),
    // Basenames are the worktrees' namespaces: unique, and never `singularity`.
    upWt: join(opts.tmp, `e2e-cj-${id}-up`),
    cloneWt: join(opts.tmp, `e2e-cj-${id}-clone`),
    logDir: join(opts.tmp, "logs"),
    check: opts.check,
    cliSeq: 0,
  };
  mkdirSync(ctx.logDir, { recursive: true });
  const { check } = ctx;
  try {
    await journey(ctx, opts.pristine);
  } catch (err) {
    if (!(err instanceof HarnessError)) throw err;
    check("the migration journey's fixture held", false, err.message);
  } finally {
    console.log(`  (CLI logs: ${ctx.logDir})`);
    await removeDataDirs(ctx, id);
  }
}

/**
 * A `./singularity check` in a temp worktree leaves its log under that
 * worktree's data dir (`~/.singularity/worktrees/<name>/`). The names are this
 * run's own (`e2e-cj-<id>-…`), so removing them touches nothing else — and the
 * prefix is re-asserted here so a changed naming rule can never widen it.
 */
async function removeDataDirs(ctx: Ctx, id: string): Promise<void> {
  for (const wt of [ctx.upWt, ctx.cloneWt]) {
    if (!existsSync(wt)) continue;
    const ns = await checkoutNamespace(wt);
    if (!ns.startsWith(`e2e-cj-${id}-`)) {
      throw new Error(`refusing to remove the data dir of namespace ${ns}`);
    }
    rmSync(worktreeDataDir(ns), { recursive: true, force: true });
  }
}

async function journey(ctx: Ctx, pristine: boolean): Promise<void> {
  const { check, upWt, cloneWt } = ctx;

  console.log("\nMigrations — fixture (a copy of this tree):");
  await setUp(ctx, pristine);
  const base = await git(cloneWt, "rev-parse", "main");
  const baseFiles = await filesAt(cloneWt, base);

  const target = await resolvePublishTarget(cloneWt);
  check(
    "the clone publishes nowhere, its remote still named origin",
    target.kind === "local" && (await git(cloneWt, "remote")) === "origin",
    JSON.stringify(target),
  );

  // --- 2. upstream moves: its own schema migration, on its main.
  console.log("\nMigrations 2 — upstream adds a table:");
  write(upWt, UPSTREAM_PROBE, probeSource("e2eUpstreamProbe", UPSTREAM_TABLE));
  const upGen = await cli(ctx, upWt, [
    "regen-migrations",
    "--name",
    "e2e_upstream",
  ]);
  if (upGen.exitCode !== 0) {
    throw new HarnessError(`upstream's generate failed:${tail(upGen)}`);
  }
  await commitAll(upWt, "upstream: e2e_upstream_probe");
  const upstreamPublished = added(baseFiles, await filesAt(upWt, "main"));
  check(
    "upstream published exactly one schema migration",
    sqlOf(upstreamPublished).length === 1 && upstreamPublished.size === 2,
    [...upstreamPublished.keys()].map(basename).join(", "),
  );

  // --- 3. the clone's own work, landed on its local main.
  console.log("\nMigrations 3 — the clone lands its own table:");
  await git(cloneWt, "checkout", "-q", "-b", "clone-own", "main");
  write(cloneWt, CLONE_PROBE, probeSource("e2eCloneProbe", "e2e_clone_probe"));
  const ownGen = await cli(ctx, cloneWt, [
    "regen-migrations",
    "--name",
    "e2e_clone",
  ]);
  if (ownGen.exitCode !== 0)
    throw new HarnessError(`clone's generate failed:${tail(ownGen)}`);
  await commitAll(cloneWt, "clone: e2e_clone_probe");
  const own = await landingPrep(ctx, cloneWt, "clone-own");
  if (own.exitCode !== 0)
    throw new HarnessError(`clone-own's normalize failed:${tail(own)}`);
  await fastForwardMain(cloneWt, "clone-own");
  const cloneLanded = added(baseFiles, await filesAt(cloneWt, "main"));
  check(
    "exactly one clone schema migration landed on local main",
    sqlOf(cloneLanded).length === 1 && cloneLanded.size === 2,
    [...cloneLanded.keys()].map(basename).join(", "),
  );
  console.log(`    landed: ${sqlOf(cloneLanded).map(basename).join(", ")}`);

  // --- 4. Problem 1: a second push, with no migration of its own.
  console.log(
    "\nMigrations 4 — a second clone push, no migration in it (Problem 1):",
  );
  await git(cloneWt, "checkout", "-q", "-b", "clone-second", "main");
  write(cloneWt, "e2e-clone-journey.txt", "unrelated work\n");
  await commitAll(cloneWt, "clone: unrelated work");
  const second = await landingPrep(ctx, cloneWt, "clone-second");
  check("its forced normalize succeeds", second.exitCode === 0, tail(second));
  const touched = (
    await git(cloneWt, "diff", "--name-status", "main", "HEAD", "--", DATA)
  )
    .split("\n")
    .filter((l) => /^[DR]/.test(l));
  check(
    "it deletes or renames no migration already on local main",
    touched.length === 0,
    `\n      ${touched.join("\n      ")}`,
  );
  const lost4 = await notIntact(cloneWt, cloneLanded);
  check(
    "the landed clone migration is byte-identical",
    lost4.length === 0,
    lost4.join(", "),
  );
  if (touched.length === 0 && lost4.length === 0 && second.exitCode === 0) {
    await fastForwardMain(cloneWt, "clone-second");
  } else {
    // A real push WOULD land this, renaming the clone's migration on its main
    // (every DB that applied it re-applies its DDL under the new sha8). The
    // journey goes on from the healthy main instead, so step 5 measures
    // Problem 2 on its own rather than Problem 1 twice.
    console.log("    (not landed — step 5 continues from the unrenamed main)");
  }

  // --- 5. Problem 2: take the upstream update.
  console.log(
    "\nMigrations 5 — `upstream merge` brings upstream's migration in (Problem 2):",
  );
  await git(cloneWt, "checkout", "-q", "-f", "-b", "update-1", "main");
  await git(cloneWt, "clean", "-q", "-fd", "--", DATA);
  const merge1 = await cli(ctx, cloneWt, ["upstream", "merge"]);
  if (merge1.exitCode !== 0) {
    throw new HarnessError(
      `upstream merge stopped (expected a clean merge):${tail(merge1)}`,
    );
  }
  const mainFiles = await filesAt(cloneWt, "main");
  const originFiles = await filesAt(cloneWt, "origin/main");
  const gen1 = await cli(ctx, cloneWt, ["regen-migrations"]);
  check(
    "the generate stage succeeds after the merge",
    gen1.exitCode === 0,
    tail(gen1),
  );

  const lost5 = await notIntact(
    cloneWt,
    new Map([...cloneLanded, ...upstreamPublished]),
  );
  check(
    "both sides' published migrations are byte-identical",
    lost5.length === 0,
    lost5.join(", "),
  );
  for (const id of [
    "snapshot-chain-intact",
    "published-migrations-immutable",
    "migration-phases-valid",
  ]) {
    const r = await cli(ctx, cloneWt, ["check", id]);
    check(`\`check ${id}\` passes`, r.exitCode === 0, tail(r));
  }
  const fresh = added(
    new Map([...mainFiles, ...originFiles]),
    await filesOnDisk(cloneWt),
  );
  const freshSql = sqlOf(fresh);
  check(
    "exactly one new migration (with its snapshot)",
    freshSql.length === 1 && fresh.size === 2,
    [...fresh.keys()].map(basename).join(", ") || "(none)",
  );
  if (freshSql.length === 1) {
    const sql = readFileSync(join(cloneWt, freshSql[0]!), "utf8");
    const statements = sql
      .split("\n")
      .filter((l) => l.trim() && !l.trimStart().startsWith("--"));
    check(
      "the merge node's SQL is the no-op merge-snapshot header",
      /--\s*singularity:merge-snapshot parents=/.test(sql) &&
        statements.length === 0,
      `\n      ${sql.split("\n").join("\n      ")}`,
    );
  }
  const before = dataFingerprint(cloneWt);
  const gen2 = await cli(ctx, cloneWt, ["regen-migrations"]);
  check(
    "a second generate emits nothing",
    gen2.exitCode === 0 && dataFingerprint(cloneWt) === before,
    gen2.exitCode === 0 ? "the data dir changed" : tail(gen2),
  );

  const step5Failed = !(
    gen1.exitCode === 0 &&
    lost5.length === 0 &&
    freshSql.length === 1 &&
    gen2.exitCode === 0
  );
  if (step5Failed) {
    check(
      "Migrations 6 (a real conflict) ran",
      false,
      "not reached — it needs step 5's merge to land cleanly first",
    );
    return;
  }

  // --- 6. a real conflict: both sides add `note`, with different types.
  console.log(
    "\nMigrations 6 — both sides add column `note`, text vs integer:",
  );
  await git(cloneWt, "add", "-A");
  await git(cloneWt, "commit", "-q", "--amend", "--no-edit");
  const upd = await landingPrep(ctx, cloneWt, "update-1");
  if (upd.exitCode !== 0)
    throw new HarnessError(`update-1's normalize failed:${tail(upd)}`);
  await fastForwardMain(cloneWt, "update-1");

  write(
    upWt,
    UPSTREAM_PROBE,
    probeSource("e2eUpstreamProbe", UPSTREAM_TABLE, "text"),
  );
  const upNote = await cli(ctx, upWt, [
    "regen-migrations",
    "--name",
    "e2e_upstream_note",
  ]);
  if (upNote.exitCode !== 0)
    throw new HarnessError(`upstream's note generate failed:${tail(upNote)}`);
  await commitAll(upWt, "upstream: note text");

  await git(cloneWt, "checkout", "-q", "-b", "clone-note", "main");
  write(
    cloneWt,
    UPSTREAM_PROBE,
    probeSource("e2eUpstreamProbe", UPSTREAM_TABLE, "integer"),
  );
  const cloneNote = await cli(ctx, cloneWt, [
    "regen-migrations",
    "--name",
    "e2e_clone_note",
  ]);
  if (cloneNote.exitCode !== 0)
    throw new HarnessError(`clone's note generate failed:${tail(cloneNote)}`);
  await commitAll(cloneWt, "clone: note integer");
  const noteLand = await landingPrep(ctx, cloneWt, "clone-note");
  if (noteLand.exitCode !== 0)
    throw new HarnessError(`clone-note's normalize failed:${tail(noteLand)}`);
  await fastForwardMain(cloneWt, "clone-note");

  await git(cloneWt, "checkout", "-q", "-b", "update-2", "main");
  const merge2 = await cli(ctx, cloneWt, ["upstream", "merge"]);
  if (merge2.exitCode !== 0) {
    // The schema SOURCE conflicts textually; the user keeps their own side,
    // which is what leaves the two snapshots disagreeing.
    const unmerged = (
      await git(cloneWt, "diff", "--name-only", "--diff-filter=U")
    )
      .split("\n")
      .filter(Boolean);
    if (unmerged.length !== 1 || unmerged[0] !== UPSTREAM_PROBE) {
      throw new HarnessError(
        `unexpected conflicts: ${unmerged.join(", ")}${tail(merge2)}`,
      );
    }
    await git(cloneWt, "checkout", "--ours", "--", UPSTREAM_PROBE);
    await git(cloneWt, "add", "--", UPSTREAM_PROBE);
    const cont = await cli(ctx, cloneWt, ["upstream", "merge", "--continue"]);
    if (cont.exitCode !== 0)
      throw new HarnessError(`merge --continue failed:${tail(cont)}`);
  }
  const conflict = await cli(ctx, cloneWt, ["regen-migrations"]);
  const out = `${conflict.stdout}\n${conflict.stderr}`;
  check(
    "the generate stage fails on the conflict",
    conflict.exitCode !== 0,
    tail(conflict),
  );
  check(
    `it names ${UPSTREAM_TABLE}'s columns.note.type`,
    out.includes(UPSTREAM_TABLE) && out.includes("columns.note.type"),
    tail(conflict),
  );
}
