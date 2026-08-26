/**
 * Install-time provisioning: the chromium binary this plugin launches at
 * runtime.
 *
 * Why this exists: the Playwright npm *package* is provisioned by `bun install`,
 * but the chromium *binary* is only fetched by an explicit `playwright install` —
 * two separate mechanisms that drift. Each Playwright minor pins a different
 * chromium revision, so the moment the resolved version's revision isn't already
 * cached, `chromium.launch()` hard-errors. Provisioning the binary by the same
 * mechanism that provisions the package is what stops them drifting.
 *
 * WHY THIS LIVES IN `provision/` AND NOT IN `core/`. It used to be
 * `core/ensureChromium()`, and from there a *request path* reached it: the
 * prototype thumbnail render called it as its first statement, so a missing
 * binary meant a backend downloading ~150 MB synchronously — the event loop
 * blocked for the whole download, answering no health check, no live-state and
 * no job, invisible even to the queue-health watchdog (a `setInterval` on the
 * loop it blocks). Downloading and installing is provisioning; provisioning is
 * install-time work. Here, no runtime can call it: `provision` is a declared
 * runtime in `boundary-config.ts` and no other runtime may import it.
 *
 * A runtime that finds no binary therefore FAILS, loudly, naming this command —
 * see `errors.ts:browserUnavailable`. That is honest: `bun install` runs
 * whenever this checkout's declared dependencies change, so a backend that is
 * serving has already been through provisioning, and a binary missing at that
 * point is an operator problem, not something a page load should quietly fix.
 *
 * WHY THE INSTALLER IS NOW ALWAYS INVOKED (no `existsSync` fast path). This used
 * to open with `if (existsSync(chromium.executablePath())) return;`. That guard
 * RE-DERIVED Playwright's own completeness rule, and got it wrong:
 * `executablePath()` returns the HEADED binary (`Google Chrome for Testing`),
 * while every caller in this repo launches headless — a different file,
 * `chrome-headless-shell`, of the same revision. They ship as a pair, so the
 * guard held by luck, not by construction. Playwright is the only authority on
 * which binaries a given version needs, so we ask it instead of guessing.
 * Running the real installer also triggers its `_deleteStaleBrowsers` GC, which
 * is what stops the shared browser cache growing a dead revision per version
 * bump forever.
 *
 * The stamp below is a RECORD OF PLAYWRIGHT'S OWN VERDICT, not a second guess at
 * it — that is the distinction from the guard it replaces. See `STAMP_REL`.
 *
 * The installer is resolved through the SAME module graph as the
 * `await import("playwright")` a runtime launches from, so installer and
 * launcher cannot disagree about which version is being provisioned. A bare
 * package-runner invocation (`bunx` / `npx`) resolves independently of the
 * workspace and can fall back to registry `latest`, provisioning a revision
 * nothing here launches — and registering a `.links` entry that pins it against
 * the GC. The `e2e-harness:pinned-playwright-invocation` check keeps those two
 * spellings out of the tree.
 *
 * The e2e harness contributes its own provisioning step that calls
 * `provisionChromium` — one implementation, two contributions, because a
 * backend's correctness must not depend on a tooling plugin's install step. The
 * step is idempotent, so the second one is a stamp read.
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  getWorktreeRoot,
  spawnPassthrough,
} from "@plugins/infra/plugins/spawn/core";

/**
 * Ceiling on the download. It is not decoration: a hung install hangs the
 * `bun install` that `./singularity build` runs, with nobody at a terminal
 * watching a stalled progress bar.
 */
const INSTALL_TIMEOUT_MS = 15 * 60_000;

/**
 * The provisioning stamp, INSIDE `node_modules` on purpose — the same placement,
 * and the same reason, as the CLI's `node_modules/.singularity-deps`: the stamp
 * can never outlive the dependency tree it describes, so `rm -rf node_modules`
 * always forces a real install.
 *
 * WHY A STAMP AT ALL, given the paragraph above about not re-deriving.
 * Measured: an already-satisfied `playwright install chromium` costs ~3.0 s of
 * subprocess, and it would pay that on every install that changes ANY
 * dependency. The stamp records that PLAYWRIGHT ITSELF returned success for this
 * exact (version, browsers-path) pair. That is categorically different from the
 * `existsSync` guard it replaces, which invented its own answer to "is the
 * browser complete?" and answered about the wrong file. Here nothing is
 * re-derived: the only claim made is one Playwright already made.
 *
 * WHAT IT CANNOT SEE, stated plainly: a browser cache deleted by hand while
 * `node_modules` stays put. The stamp then claims a provisioning that is no
 * longer true. That is survivable *because the failure is now loud and
 * self-remediating* — a launch throws naming the exact command to re-run
 * (`errors.ts:browserUnavailable`, and the e2e harness's launch diagnostic).
 * Reclaiming the cache is a deliberate operator act; recovering from it is one
 * command.
 */
const STAMP_REL = join("node_modules", ".singularity-chromium");

/** Bumped when the stamp's shape changes; an older version reads as "no stamp". */
const STAMP_VERSION = 1;

interface Stamp {
  version: number;
  /**
   * `playwright-core`'s version, not `playwright`'s: the browser revision is
   * pinned by core, so core is what the provisioned bytes are a function of.
   */
  playwrightCore: string;
  /**
   * `PLAYWRIGHT_BROWSERS_PATH`, verbatim — `""` meaning "the OS default cache
   * dir". Stored rather than resolved: resolving it would mean reimplementing
   * Playwright's own cache-dir rule, which is exactly the re-derivation this
   * file exists to stop. Recording the raw env value is enough to force a real
   * install whenever it changes, which is what a provisioning run into a scratch
   * dir depends on.
   */
  browsersPath: string;
}

interface Resolved {
  /** Absolute path to playwright's own CLI entry point, per its `bin` field. */
  cli: string;
  stamp: Stamp;
}

/**
 * Resolve the installer and the identity of what it will install, through the
 * module graph a runtime's `import("playwright")` resolves from — `import.meta.dir`
 * is inside this plugin, so resolution walks up exactly as a launch does.
 */
function resolvePlaywright(): Resolved {
  const pkgPath = Bun.resolveSync("playwright/package.json", import.meta.dir);
  const pkgDir = dirname(pkgPath);
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    bin?: { playwright?: string };
  };
  const bin = pkg.bin?.playwright;
  if (!bin) {
    throw new Error(
      `${pkgPath} declares no \`bin.playwright\` — cannot locate the Playwright CLI to provision chromium with.`,
    );
  }

  // playwright-core is playwright's own nested dependency, so it is resolvable
  // from playwright's directory and generally not from the repo root.
  const corePkgPath = Bun.resolveSync("playwright-core/package.json", pkgDir);
  const core = JSON.parse(readFileSync(corePkgPath, "utf8")) as {
    version?: string;
  };
  if (!core.version) {
    throw new Error(`${corePkgPath} declares no \`version\`.`);
  }

  return {
    cli: join(pkgDir, bin),
    stamp: {
      version: STAMP_VERSION,
      playwrightCore: core.version,
      browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? "",
    },
  };
}

/**
 * The recorded stamp, or null when there is none to trust.
 *
 * A missing or unparseable stamp means "unknown", and unknown resolves to
 * *install* — the conservative direction. Nothing is silenced: any read error
 * other than "not there" or "not JSON" propagates.
 */
function readStamp(file: string): Stamp | null {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    return JSON.parse(raw) as Stamp;
  } catch (err) {
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

function stampMatches(recorded: Stamp | null, want: Stamp): boolean {
  return (
    recorded !== null &&
    recorded.version === want.version &&
    recorded.playwrightCore === want.playwrightCore &&
    recorded.browsersPath === want.browsersPath
  );
}

/** Write-temp + rename on the same fs, so a killed install leaves no half stamp. */
function writeStamp(file: string, stamp: Stamp): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(stamp));
  renameSync(tmp, file);
}

/**
 * Ensure the browsers the currently-resolved Playwright expects are present in
 * the shared browser cache (~/Library/Caches/ms-playwright on macOS).
 *
 * Steady state is one file read. The cache is global and shared across all
 * worktrees, so only the first worktree on a machine (per revision) downloads;
 * the rest still run the installer once, which is what prunes revisions no
 * installation claims any more.
 */
export async function provisionChromium(): Promise<void> {
  const { cli, stamp } = resolvePlaywright();
  const stampFile = join(await getWorktreeRoot(), STAMP_REL);
  if (stampMatches(readStamp(stampFile), stamp)) return;

  // Install-time: no backend is running, so the structured logger (which
  // persists over HTTP to a live server) is unreachable — console is the sink,
  // which is exactly why `log-channels`' rule ignores `provision/**` outright.
  // (No `eslint-disable` needed here, and one would itself be a lint error.)
  console.log(
    `Provisioning Playwright chromium for playwright-core ${stamp.playwrightCore}…`,
  );

  // `spawnPassthrough` inherits stdout/stderr, so the download's own progress
  // output reaches the terminal — the whole reason this step is worth watching.
  // It carries no timeout of its own, so the bound is applied through the kill
  // handle it hands back synchronously.
  //
  // `process.execPath` + the resolved CLI path, never a package-runner spelling: the
  // point of resolving above is that this spawns the workspace's own Playwright.
  const argv = [process.execPath, cli, "install", "chromium"];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const { exitCode, signalCode } = await spawnPassthrough(argv, {
      onSpawn: ({ kill }) => {
        timer = setTimeout(() => {
          timedOut = true;
          kill("SIGTERM");
        }, INSTALL_TIMEOUT_MS);
      },
    });
    if (timedOut) {
      throw new Error(
        `\`bun run playwright install chromium\` did not finish within ${INSTALL_TIMEOUT_MS}ms — killed (ran as ${argv.join(" ")})`,
      );
    }
    if (exitCode !== 0) {
      throw new Error(
        `\`bun run playwright install chromium\` failed (exit ${exitCode}${signalCode ? `, signal ${signalCode}` : ""}; ran as ${argv.join(" ")})`,
      );
    }
  } finally {
    clearTimeout(timer);
  }

  // Recorded only after Playwright answered success — the stamp is its verdict,
  // never a prediction of one.
  writeStamp(stampFile, stamp);
}

export default async function provision(): Promise<void> {
  await provisionChromium();
}
