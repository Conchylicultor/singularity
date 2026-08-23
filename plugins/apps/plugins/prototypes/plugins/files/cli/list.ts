import type { CliAction } from "@plugins/framework/plugins/cli/core";
import { PROTOTYPES_DIR_DISPLAY } from "@plugins/infra/plugins/paths/plugins/display/core";
import { listPrototypeMetas } from "../shared/list-metas";
import { prototypeUrlFormatter } from "./prototype-url";

/**
 * `./singularity prototype list` — every prototype on disk, with the URL that
 * opens it.
 *
 * Reads the tree through the same `listPrototypeMetas()` the server's list
 * endpoint and live resource use — it sits in `shared/` precisely so this
 * process can call it — rather than fetching `GET /api/prototypes`. So the verb
 * answers with no backend running, and there is one implementation of "read the
 * metas" rather than a terminal-shaped second one that could disagree with the
 * gallery.
 *
 * An empty tree is a legitimate answer (nobody has authored a mock yet), not a
 * failure, so it prints as a sentence instead of nothing at all — a bare empty
 * output would read as "the command is broken".
 */
const run: CliAction<[], object> = async () => {
  const metas = await listPrototypeMetas();
  if (metas.length === 0) {
    console.log(`No prototypes yet in ${PROTOTYPES_DIR_DISPLAY}.`);
    console.log(`Create one with: ./singularity prototype new "My mock"`);
    return;
  }

  const url = await prototypeUrlFormatter();
  const width = Math.max(...metas.map((m) => m.name.length));
  for (const meta of metas) {
    console.log(`${meta.name.padEnd(width)}  ${meta.title}`);
    console.log(`${" ".repeat(width)}  ${url(meta.name)}`);
    // A malformed folder is listed, never hidden — same rule as the gallery
    // card, which shows the problems rather than dropping the prototype.
    for (const problem of meta.problems) {
      const where = problem.path === "" ? "" : `${problem.path}: `;
      console.log(`${" ".repeat(width)}  ! ${where}${problem.detail}`);
    }
  }
};

export default run;
