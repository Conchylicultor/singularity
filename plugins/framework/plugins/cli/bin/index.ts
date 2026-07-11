import { program } from "commander";
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

program.parse();
