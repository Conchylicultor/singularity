import type { Command } from "commander";
import { checkBroadcasts } from "../broadcasts";
import { withHostSlot, type HostSlotKind } from "../host-semaphore";
import { listAllChecks, runChecks } from "@plugins/framework/plugins/tooling/plugins/checks/core";

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
      const ok = await withHostSlot(kind, () =>
        runChecks(checks.length > 0 ? checks : undefined, {
          noCache: opts.cache === false,
          log: (line, stream) =>
            stream === "stderr" ? console.error(line) : console.log(line),
        }),
      );
      if (!ok) process.exit(1);
    });
}
