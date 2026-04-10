import { program } from "commander";
import { registerBuild } from "./commands/build";

program.name("singularity").description("Singularity agent CLI");

registerBuild(program);

program.parse();
