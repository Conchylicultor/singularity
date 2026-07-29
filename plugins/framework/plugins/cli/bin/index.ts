import { program } from "commander";
import { installOrphanGuard, isOpCommand, ORPHAN_EXIT_CODE } from "./orphan-guard";
import { registerApplyMigrations } from "./commands/apply-migrations";
import { registerBuild } from "./commands/build";
import { registerBuildComposition } from "./commands/build-composition";
import { registerCheck } from "./commands/check";
import { registerDb } from "./commands/db";
import { registerPush } from "./commands/push";
import { registerRegenGenerated } from "./commands/regen-generated";
import { registerRegenMigrations } from "./commands/regen-migrations";
import { registerRelease } from "./commands/release";
import { registerServeApp } from "./commands/serve-app";
import { registerStart } from "./commands/start";
import { runCli } from "./run-cli";

// A long-running op runs in THIS process, whose ppid is the invoking shell —
// so it observes its own orphaning directly. Terminate when that shell dies, so
// an orphaned op never holds a host lock (the push mutex worst case) forever.
if (isOpCommand(process.argv[2])) {
  installOrphanGuard(() => process.exit(ORPHAN_EXIT_CODE));
}

program.name("singularity").description("Singularity agent CLI");

registerApplyMigrations(program);
registerBuild(program);
registerBuildComposition(program);
registerCheck(program);
registerDb(program);
registerPush(program);
registerRegenGenerated(program);
registerRegenMigrations(program);
registerRelease(program);
registerServeApp(program);
registerStart(program);

await runCli(program);
