import { readFileSync } from "fs";
import { join, resolve } from "path";
import {
  getWorktreeRoot,
  spawnCaptured,
} from "@plugins/infra/plugins/spawn/core";
import type {
  Check,
  CheckResult,
} from "@plugins/framework/plugins/tooling/core";

/** The probe's own exit protocol — see the file it names. */
const PROBE = "internal/fd-double-close-probe.ts";
const PROBE_DEFECT_EXIT = 3;

/**
 * Twelve rounds of spawn + socket + two forced garbage collections take under a
 * second. This bound is here for the wedge, not the duration: a probe that hangs
 * is itself a finding, and the check must say so rather than stall a build.
 */
const PROBE_TIMEOUT_MS = 60_000;

/** An exact release, the only thing this check accepts as a pin. */
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * `bun = "…"` inside mise.toml's `[tools]` table. Anchored to the table so a
 * `bun` key under some other section can never be read as the toolchain pin.
 */
function readPinnedBun(root: string): string | null {
  const text = readFileSync(join(root, "mise.toml"), "utf8");
  const opensTools = /^\[tools\]$/m.exec(text);
  if (opensTools === null) return null;
  const afterHeader = text.slice(opensTools.index + opensTools[0].length);
  const nextTable = /^\[/m.exec(afterHeader);
  const table =
    nextTable === null ? afterHeader : afterHeader.slice(0, nextTable.index);
  return /^\s*bun\s*=\s*"([^"]*)"/m.exec(table)?.[1] ?? null;
}

const BACKGROUND =
  "Bun up to and including 1.3.14 closes a finished child's extra stdio fds a second time when it " +
  "garbage-collects the child, so it closes whatever has taken those numbers since. In this repo that " +
  "was pooled Postgres sockets, closed mid-query: the query hung, and on 2026-09-11 every live update " +
  "froze until main restarted. Playwright hands Chromium two extra pipe fds on every launch, and the " +
  "backend launches Chromium for prototype thumbnails and browser-fetch. Fixed upstream in " +
  "oven-sh/bun#33828, first shipped in 1.4.0.";

/**
 * The Bun this repo runs is the Bun it committed to, and that Bun does not
 * double-close a child's extra stdio fds.
 *
 * Three arms, narrowest first. The first two are bookkeeping — they keep the
 * committed pin and the running process from drifting apart, and give a failure
 * a name. The third is the actual guard: it reproduces the defect rather than
 * checking a version number, so it also catches a future Bun that regresses,
 * which no allowlist of known-good versions could.
 *
 * What it does NOT prove: only this one defect. Upstream #35931 (`Dir.close`
 * closing an fd it did not open) and #38630 (an unidentified double close in
 * the async closer) are still open, and a green run here says nothing about
 * either.
 */
const check: Check = {
  id: "bun-runtime",
  // Tree-scoped on purpose, so `build` and `push` both assert it — a Bun that
  // kills Postgres sockets must not reach a deploy, and `host` scope is
  // excluded from exactly those two callers. Like `no-gitlinks`, the verdict
  // reads state the tree hash does not cover (there, the live git index; here,
  // the running binary), so it opts out of caching entirely. Nothing is
  // recorded, so no PASS can transfer to a process running a different Bun.
  // It costs ~0.4 s, which is what makes that affordable.
  cacheSignature: () => null,
  description:
    "the running Bun is the exact version mise.toml pins, and it does not double-close a child's extra stdio fds",
  async run(): Promise<CheckResult> {
    const root = await getWorktreeRoot();

    const pinned = readPinnedBun(root);
    if (pinned === null) {
      return {
        ok: false,
        message: "mise.toml declares no `bun` under [tools].",
        hint: 'Add `bun = "<exact version>"` to the [tools] table.',
      };
    }
    if (!EXACT_VERSION.test(pinned)) {
      return {
        ok: false,
        message:
          `mise.toml pins bun as "${pinned}", which is not an exact version. ` +
          "A floating pin makes the Bun that actually runs an invisible machine fact: mise resolves it " +
          "once, at install time, and nothing afterwards records or rechecks which build that was. " +
          "That is how this repo came to sit on 1.3.13 for four months. " +
          BACKGROUND,
        hint: 'Pin one release, e.g. `bun = "1.4.2"`, and run `mise install`.',
      };
    }
    if (Bun.version !== pinned) {
      return {
        ok: false,
        message: `mise.toml pins bun ${pinned}, but this process is running ${Bun.version}.`,
        hint:
          `Run \`mise install\` to get ${pinned}. If ${Bun.version} is the version you meant, ` +
          "change the pin in mise.toml instead, so the committed file keeps naming what runs.",
      };
    }

    const probe = await spawnCaptured(
      [process.execPath, resolve(import.meta.dir, PROBE)],
      {
        cwd: root,
        timeoutMs: PROBE_TIMEOUT_MS,
      },
    );
    const said =
      (probe.stdout.trim() || probe.stderr.trim()).split("\n").at(-1) ?? "";

    if (probe.exitCode === PROBE_DEFECT_EXIT) {
      return {
        ok: false,
        message: `${said}\n${BACKGROUND}`,
        hint:
          "Pin a Bun that does not have it — 1.4.0 and later are clean — in mise.toml, then `mise install`. " +
          "If the pinned version is already 1.4.0 or later, this is a NEW regression upstream: stop, and report it.",
      };
    }
    if (probe.exitCode !== 0) {
      return {
        ok: false,
        inconclusive: true,
        message:
          `The fd double-close probe could not run (exit ${probe.exitCode}${probe.timedOut ? ", timed out" : ""}).` +
          (said ? `\n${said}` : ""),
        hint: `Run it by hand to see why: \`./singularity run ${PROBE}\` from the check plugin's directory.`,
      };
    }
    return { ok: true };
  },
};

export default check;
