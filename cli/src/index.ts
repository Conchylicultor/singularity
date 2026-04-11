import { program } from "commander";
import { registerBuild } from "./commands/build";
import { registerPush } from "./commands/push";

program.name("singularity").description("Singularity agent CLI");

registerBuild(program);
registerPush(program);

program.parse();
