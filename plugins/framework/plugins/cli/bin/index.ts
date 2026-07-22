import { program } from "commander";
import { isOpCommand, maybeReexecUnderInspector } from "./inspect";
import { installOrphanGuard, ORPHAN_EXIT_CODE } from "./orphan-guard";
import { registerApplyMigrations } from "./commands/apply-migrations";
import { registerBuild } from "./commands/build";
import { registerCheck } from "./commands/check";
import { registerDb } from "./commands/db";
import { registerPush } from "./commands/push";
import { registerRegenGenerated } from "./commands/regen-generated";
import { registerRegenMigrations } from "./commands/regen-migrations";
import { registerRelease } from "./commands/release";
import { registerServeApp } from "./commands/serve-app";
import { registerStart } from "./commands/start";
import { runCli } from "./run-cli";

// Op commands re-exec once under `bun --inspect` (pre-armed wedge forensics —
// see ./inspect.ts). When the re-exec ran, the child already executed the
// command; this process only mirrors its exit code.
if (await maybeReexecUnderInspector()) {
  process.exit(process.exitCode ?? 0);
}

// Past the re-exec block only when THIS process runs the command: the inspected
// worker (backstop if the wrapper is SIGKILLed and the worker reparents to 1),
// or the direct op when the inspector is disabled (its ppid is the shell — the
// primary guard there).
if (isOpCommand(process.argv[2])) {
  installOrphanGuard(() => process.exit(ORPHAN_EXIT_CODE));
}

program.name("singularity").description("Singularity agent CLI");

registerApplyMigrations(program);
registerBuild(program);
registerCheck(program);
registerDb(program);
registerPush(program);
registerRegenGenerated(program);
registerRegenMigrations(program);
registerRelease(program);
registerServeApp(program);
registerStart(program);

await runCli(program);
