import { program } from "commander";
import { registerBuild } from "./commands/build";
import { registerCheck } from "./commands/check";
import { registerPush } from "./commands/push";
import { registerRegenDocs } from "./commands/regen-docs";
import { registerRegenMigrations } from "./commands/regen-migrations";
import { registerStart } from "./commands/start";

program.name("singularity").description("Singularity agent CLI");

registerBuild(program);
registerCheck(program);
registerPush(program);
registerRegenDocs(program);
registerRegenMigrations(program);
registerStart(program);

program.parse();
