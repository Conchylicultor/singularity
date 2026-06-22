import { program } from "commander";
import { registerBuild } from "./commands/build";
import { registerCheck } from "./commands/check";
import { registerPush } from "./commands/push";
import { registerRegenGenerated } from "./commands/regen-generated";
import { registerRegenMigrations } from "./commands/regen-migrations";
import { registerRelease } from "./commands/release";
import { registerServeApp } from "./commands/serve-app";
import { registerStart } from "./commands/start";

program.name("singularity").description("Singularity agent CLI");

registerBuild(program);
registerCheck(program);
registerPush(program);
registerRegenGenerated(program);
registerRegenMigrations(program);
registerRelease(program);
registerServeApp(program);
registerStart(program);

program.parse();
