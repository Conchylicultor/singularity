import { program } from "commander";
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

/**
 * The CLI proper: the commander program, one `register*` per command file, and
 * the parse. This IS what `./singularity <cmd>` runs — it was split out of
 * `./index.ts` unchanged, and is reached ONLY through that bootstrap's
 * `await import("./cli")`.
 *
 * Why the split exists: this file's very first line imports `commander`, an npm
 * package. A static import is hoisted above every statement in its module, so a
 * module that wants to run `bun install` BEFORE the CLI cannot also be the
 * module that imports the CLI's dependencies — the resolution would happen
 * first, against the `node_modules` we were about to fix. Reaching this file is
 * therefore the *act* of asserting "`node_modules` is known good": everything
 * that guarantees it happens in `./index.ts`, before the dynamic import that
 * loads this module. See that file's docblock for the whole contract.
 *
 * Nothing else here is special: `cli.ts` loads in exactly the pre-plugin-barrel
 * state `index.ts` used to, so the ESM-freeze constraints the command modules
 * carry (see ./commands/internal/app-artifacts.ts) are unchanged by the move.
 */

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
