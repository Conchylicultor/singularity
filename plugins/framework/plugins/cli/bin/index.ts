import { program } from "commander";
import { maybeReexecUnderInspector } from "./inspect";
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
