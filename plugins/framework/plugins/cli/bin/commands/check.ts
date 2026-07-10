import { basename, join } from "path";
import type { Command } from "commander";
import { checkBroadcasts } from "../broadcasts";
import { withHostSlot, type HostSlotKind } from "../host-semaphore";
import { MAIN_WORKTREE_NAME, worktreeDataDir } from "../paths";
import { publishLane } from "../lane";
import { listAllChecks, runChecks } from "@plugins/framework/plugins/tooling/plugins/checks/core";
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
      // Push runs its checks via this command in a subprocess (see push.ts).
      // The PARENT push process already holds the reserved push slot before
      // spawning us, so we must NOT acquire one ourselves — a second acquire of
      // the single push slot would deadlock (parent holds it, parent awaits us).
      // It signals this via SINGULARITY_HOST_SLOT_HELD; we run exempt (no gate).
      // A direct `./singularity check` is a build-pool job.
      const kind: HostSlotKind = process.env.SINGULARITY_HOST_SLOT_HELD ? "exempt" : "build";

      // Resolve the worktree slug once: it names both the op marker and the
      // full-output log file. The full check transcript is always written here
      // so a failure's real cause is one `cat` away even when the console copy
      // is truncated or piped through `tail`.
      const slug = await getWorktreeSlug();
      const logFile = join(worktreeDataDir(slug), "check.log");

      // Publish the lane for the type-check fleet's host-wide worker budget: a
      // direct check on the main worktree is human-blocking (interactive), any
      // other direct check is background. publishLane not-clobbers, so a
      // push-nested check keeps the interactive value push.ts already set in its
      // env even though it runs on an agent branch. See ../lane.ts.
      publishLane(slug === MAIN_WORKTREE_NAME);

      // Mark this worktree as having a check in flight so the conversation status
      // poller keeps the agent's pane reading as "working" while the CLI "shell"
      // status persists (see worktree-op.ts), and the op-status banner/chip
      // surface "Check in progress". Written up-front as "waiting-for-lock" and
      // flipped to "running" once the host build slot is granted, so a check
      // queued for the slot reads as queued rather than running. Only for a
      // DIRECT `./singularity check` (kind === "build"); a push-nested check
      // (exempt) is already covered by the push marker, so writing a second
      // marker would just churn the status.
      const marker = kind === "build";
      if (marker) {
        markWorktreeOpStart(slug, "check", "waiting-for-lock");
        process.on("exit", () => clearWorktreeOp(slug, "check"));
      }
      try {
        const ok = await withHostSlot(kind, () => {
          if (marker) setWorktreeOpPhase(slug, "check", "running");
          return runChecks(checks.length > 0 ? checks : undefined, {
            noCache: opts.cache === false,
            logFile,
            log: (line, stream) =>
              stream === "stderr" ? console.error(line) : console.log(line),
          });
        });
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
