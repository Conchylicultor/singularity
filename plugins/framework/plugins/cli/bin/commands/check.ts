import { basename, join } from "path";
import type { Command } from "commander";
import { checkBroadcasts } from "../broadcasts";
import { withHostGrant, inheritedGrant } from "@plugins/infra/plugins/host-admission/server";
import { cpuBudget, type Grant, type Lane } from "@plugins/infra/plugins/host-admission/core";
import { MAIN_WORKTREE_NAME, worktreeDataDir } from "../paths";
import { publishLane } from "../lane";
import { listAllChecks, runChecks, type RunChecksOptions } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { markWorktreeOpStart, setWorktreeOpPhase, clearWorktreeOp } from "@plugins/infra/plugins/worktree/server";

// The op-marker slug for this worktree — its directory basename, matching what
// `build` / `push` write (see worktree-op.ts). Mirrors the local
// `getWorktreeRoot()` helpers in build.ts / push.ts.
async function getWorktreeSlug(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) {
    console.error("Not in a git repository");
    process.exit(1);
  }
  return basename(output.trim());
}

export function registerCheck(program: Command) {
  program
    .command("check")
    .description("Run repo validation checks")
    .argument("[checks...]", "Check IDs to run (default: all)")
    .option("--list", "List available checks and exit")
    .option("--no-cache", "Bypass the tree-hash check-result cache")
    .action(async (checks: string[], opts: { list?: boolean; cache?: boolean }) => {
      if (opts.list) {
        const all = await listAllChecks();
        for (const c of all) console.log(`  ${c.id} — ${c.description}`);
        return;
      }
      await checkBroadcasts("check");

      // Resolve the worktree slug once: it names both the op marker and the
      // full-output log file. The full check transcript is always written here
      // so a failure's real cause is one `cat` away even when the console copy
      // is truncated or piped through `tail`.
      const slug = await getWorktreeSlug();
      const logFile = join(worktreeDataDir(slug), "check.log");

      // Publish the lane: a direct check on the main worktree is human-blocking
      // (interactive), any other direct check is background. publishLane
      // not-clobbers, so a push-nested check keeps the interactive value push.ts
      // set in its env even though it runs on an agent branch. See ../lane.ts.
      const lane: Lane = slug === MAIN_WORKTREE_NAME ? "interactive" : "background";
      publishLane(slug === MAIN_WORKTREE_NAME);

      // Push runs its checks via this command in a subprocess (see push.ts). The
      // parent push already holds a host CPU grant and hands us its unit count in
      // the environment, so `inheritedGrant()` reconstructs it and we spend those
      // units WITHOUT acquiring host-wide again — no double-acquire, no deadlock.
      // A direct `./singularity check` inherits nothing and acquires its own
      // grant via `withHostGrant`.
      const inherited = inheritedGrant();

      // Mark this worktree as having a check in flight so the conversation status
      // poller keeps the agent's pane reading as "working" while the CLI "shell"
      // status persists (see worktree-op.ts), and the op-status banner/chip
      // surface "Check in progress". Written up-front as "waiting-for-lock" and
      // flipped to "running" once the host CPU grant is acquired, so a check
      // queued for its grant reads as queued rather than running. Only for a
      // DIRECT `./singularity check` (no inherited grant); a push-nested check
      // (inherited grant, no wait) is already covered by the push marker, so a
      // second marker would just churn the status.
      const marker = inherited === undefined;
      if (marker) {
        markWorktreeOpStart(slug, "check", "waiting-for-lock");
        process.on("exit", () => clearWorktreeOp(slug, "check"));
      }
      try {
        const runUnder = (grant: Grant): Promise<boolean> => {
          // The grant is now held — on the direct path `runUnder` is the
          // `withHostGrant` callback, so this runs only after acquisition; flip
          // the marker to "running" (a no-op on the inherited path, where
          // `marker` is false and the parent push owns the status).
          if (marker) setWorktreeOpPhase(slug, "check", "running");
          const runOpts: RunChecksOptions = {
            grant,
            noCache: opts.cache === false,
            logFile,
            log: (line, stream) =>
              stream === "stderr" ? console.error(line) : console.log(line),
          };
          return runChecks(checks.length > 0 ? checks : undefined, runOpts);
        };
        const ok = inherited
          ? await runUnder(inherited)
          : await withHostGrant({ lane, max: cpuBudget().B }, runUnder);
        if (!ok) {
          // Last line, so it survives `./singularity check | tail`.
          console.error(`\nFull check output: ${logFile}`);
          process.exit(1);
        }
      } finally {
        if (marker) clearWorktreeOp(slug, "check");
      }
    });
}
