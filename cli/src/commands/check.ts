import type { Command } from "commander";
import { checkBroadcasts } from "../broadcasts";
import { CHECKS, listAllChecks, runChecks } from "../checks";

export function registerCheck(program: Command) {
  const cmd = program
    .command("check")
    .description("Run repo validation checks (schema sync, etc.)")
    .option("--list", "List available checks and exit");

  for (const c of CHECKS) {
    cmd.option(`--${c.id}`, c.description);
  }

  cmd.action(async (opts: Record<string, boolean>) => {
    if (opts.list) {
      const all = await listAllChecks();
      for (const c of all) console.log(`  ${c.id} — ${c.description}`);
      return;
    }
    await checkBroadcasts("check");
    const selected = CHECKS.map((c) => c.id).filter((id) => opts[camel(id)]);
    const ok = await runChecks(selected.length > 0 ? selected : undefined);
    if (!ok) process.exit(1);
  });
}

function camel(id: string): string {
  return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
