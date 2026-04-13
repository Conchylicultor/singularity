import { program } from "commander";
import { registerBuild } from "./commands/build";
import { registerCheck } from "./commands/check";
import { registerPush } from "./commands/push";

program.name("singularity").description("Singularity agent CLI");

registerBuild(program);
registerCheck(program);
registerPush(program);

program.parse();
