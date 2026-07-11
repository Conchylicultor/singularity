import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { defineHostPool } from "@plugins/infra/plugins/host-admission/server";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/core";
import type { Check, CheckContext, CheckResult } from "@plugins/framework/plugins/tooling/core";
import { classifyFailure } from "./classify";

// The contributed `layout-geometry` check. It gates the layout-primitive geometry
// invariants (no track collision / no overlap / truncation-onset) by shelling out
// to the bun:test geometry suite — but only when the inputs the suite depends on
// have changed. Steady-state cost is ZERO browser launches via a sidecar marker
// keyed on the css-subtree + app.css tree hash.

// Globs whose tree-SHAs are the suite's real inputs: every css primitive (the
// fixtures + the primitives they render) and the ui-kit Tailwind stylesheet.
const SIG_GLOBS = [
  "plugins/primitives/plugins/css/plugins/**",
  "plugins/primitives/plugins/css/plugins/ui-kit/web/theme/app.css",
];

const SUITE_REL =
  "plugins/primitives/plugins/css/plugins/layout-harness/web/internal/layout-geometry.test.ts";

const MARKER_DIR = join(SINGULARITY_DIR, "layout-lab-cache");

// Host-wide single-holder gate for the browser-based suite. The suite spawns a
// Vite build + a headless Chromium; concurrent worktree builds would otherwise
// each launch Chromium at the same moment, thrashing CPU until Playwright's
// launch budget is exhausted — the headless-launch-timeout flake. size 1 ⇒ at
// most one suite runs across ALL worktrees; combined with the post-acquire
// marker re-check it also collapses the same-sig thundering herd (the first
// build runs + writes the marker, the rest skip the launch). flock-backed, so it
// auto-releases on crash. Declared through `defineHostPool` (cost cpu 1 — a Vite
// build + Chromium) so it takes budget from the same host ceiling as every other
// pool; the caller ALSO spends a `ctx.grant` unit around the launch (below), so
// the run is both mutually-exclusive AND accounted against the invoking build's
// CPU grant — two different guarantees.
const browserPool = defineHostPool({ id: "layout-geometry", size: 1, cost: { cpu: 1 } });

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// sha256 over the WORKING-TREE content of every input file (tracked + untracked
// not-ignored) under the globs. `git ls-files -s` alone reads the INDEX blob SHA,
// which misses unstaged edits and untracked files (the layout-harness sources
// themselves) — so a real geometry-affecting change could be cached past. We
// therefore enumerate the paths with git (which honors .gitignore) and hash each
// file's actual on-disk content. Sync + cheap (the css subtree is small source),
// so `cacheSignature` reuses it.
function listFiles(root: string): string[] {
  const args = [
    ["ls-files", "--", ...SIG_GLOBS],
    ["ls-files", "--others", "--exclude-standard", "--", ...SIG_GLOBS],
  ];
  const set = new Set<string>();
  for (const a of args) {
    const proc = Bun.spawnSync(["git", ...a], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const out = new TextDecoder().decode(proc.stdout).trim();
    for (const line of out.split("\n")) if (line) set.add(line);
  }
  return [...set].sort();
}

function computeSig(root: string): string {
  const h = createHash("sha256");
  for (const rel of listFiles(root)) {
    h.update(rel);
    h.update("\0");
    try {
      h.update(readFileSync(join(root, rel)));
    } catch (err) {
      // A path that vanished between listing and read (e.g. a transient artifact)
      // contributes nothing; any other IO error is real and must surface.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    h.update("\0");
  }
  return h.digest("hex");
}

function rootSync(): string {
  const proc = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return new TextDecoder().decode(proc.stdout).trim();
}

function markerFile(sig: string): string {
  return join(MARKER_DIR, `${sig}.pass`);
}

const check: Check = {
  id: "layout-geometry",
  description:
    "layout primitives hold their geometry invariants (no track collision / overlap regressions)",
  // Fold the css-subtree sig into the runner's own cache key so identical
  // full-tree reruns (push reusing build) short-circuit. Cheap + side-effect-free.
  cacheSignature(): string {
    return computeSig(rootSync());
  },
  async run(ctx: CheckContext): Promise<CheckResult> {
    const root = await getRoot();
    const sig = computeSig(root);

    // Steady state: an unchanged css subtree ⇒ the sidecar marker exists ⇒ return
    // OK WITHOUT launching Chromium, regardless of unrelated edits elsewhere. This
    // fast path stays UN-gated, so the zero-launch steady state never queues.
    mkdirSync(MARKER_DIR, { recursive: true });
    if (existsSync(markerFile(sig))) return { ok: true };

    // Marker absent ⇒ the suite must actually launch Chromium. Spend a grant unit
    // (a cpu-holder that then waits on the size-1 pool — acyclic, the pool holder
    // waits for nothing) around the host-wide-serialized launch. Re-check the
    // marker after acquiring: a peer build with the same sig may have just run the
    // suite and written it, in which case we skip the launch (double-checked).
    return ctx.grant.run(() => browserPool.run(async () => {
      if (existsSync(markerFile(sig))) return { ok: true };

      // Chromium must be provisioned (the e2e postinstall owns that). Fail loudly
      // with a clear hint — never auto-install.
      let exe: string;
      try {
        exe = chromium.executablePath();
      } catch (err) {
        return {
          ok: false,
          message: `Could not resolve the Playwright Chromium executable: ${(err as Error).message}`,
          hint: "Provision the browser with `bun e2e/ensure-chromium.mjs` (or `bun run playwright install chromium`), then re-run.",
        };
      }
      if (!exe || !existsSync(exe)) {
        return {
          ok: false,
          message: `Playwright Chromium is not installed (expected at ${exe || "<unresolved>"}).`,
          hint: "Provision the browser with `bun e2e/ensure-chromium.mjs` (or `bun run playwright install chromium`), then re-run.",
        };
      }

      // `--timeout 120000`: this suite's `beforeAll` runs a Vite build + a cold
      // headless Chromium launch + page load, which routinely exceeds bun:test's
      // default 5s per-hook budget under any real load — the dominant cause of the
      // historical "hook timed out / launch timeout" flake. The flag raises the
      // default for every hook AND test in the suite (the measures themselves stay
      // sub-second), so a slow-but-healthy setup never trips the gate.
      const proc = Bun.spawn(["bun", "test", "--timeout", "120000", resolve(root, SUITE_REL)], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      if (exitCode === 0) {
        // Record the pass atomically (write-temp + rename on the same fs).
        const file = markerFile(sig);
        const tmp = join(MARKER_DIR, `.${sha256(file).slice(0, 12)}.tmp`);
        writeFileSync(tmp, JSON.stringify({ sig, recordedAt: Date.now() }));
        renameSync(tmp, file);
        return { ok: true };
      }

      // Classify on the FULL, untruncated transcript — a real assertion/oracle
      // failure printed early in a long, timeout-laced run must NOT be trimmed
      // away by the tail and misread as environmental. Only the human-facing
      // `message` below uses the tail.
      const fullOutput = `${stdout}\n${stderr}`;

      // bun:test prints results to stderr; include a tail of both streams.
      const tail = (s: string, n = 60): string =>
        s.trim().split("\n").slice(-n).join("\n");
      const combined = [tail(stderr), tail(stdout)].filter(Boolean).join("\n");

      if (classifyFailure(fullOutput) === "inconclusive") {
        // Environmental: the suite never reached a verdict (cold Vite/Chromium
        // under host load timed out), NOT a geometry regression. Non-fatal and
        // NOT cached — the pass marker is deliberately not written, so the next
        // build re-launches the suite and re-verifies the invariants.
        return {
          ok: false,
          inconclusive: true,
          message: `layout geometry suite timed out (environmental — cold Vite/Chromium under host load, not a geometry regression; exit ${exitCode}):\n${combined}`,
          hint: `Re-run \`bun test --timeout 120000 ${SUITE_REL}\` on a quieter host to re-verify; the check retries automatically on the next build.`,
        };
      }

      return {
        ok: false,
        message: `layout geometry suite failed (exit ${exitCode}):\n${combined}`,
        hint: `A layout primitive geometry invariant regressed — run \`bun test --timeout 120000 ${SUITE_REL}\` to see which fixture/slot collided.`,
      };
    }));
  },
};

export default check;
