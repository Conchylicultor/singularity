import type { CliAction } from "@plugins/framework/plugins/cli/core";
import { cliExecContext } from "@plugins/infra/plugins/jobs/plugins/supervised-job/cli";
import { declaredDep, ensureDep } from "../../deps";

// No backend boot: the declarations are a generated registry and the engine
// is host-only code, so this process installs directly — the same `ensureDep`
// a supervised job runs, under the same host flock.
//
// `--json`: stdout carries exactly one line, `{ id, identity, dir }`, and
// progress goes to stderr — so host code that cannot import the `deps/` engine
// barrel (a `web/`-row test driver) can still ask for an install and learn
// where it landed.
const run: CliAction<[string], { json?: boolean }> = async (id, opts) => {
  const started = Date.now();
  const say = opts.json
    ? (line: string) => console.error(line)
    : (line: string) => console.log(line);
  const ready = await ensureDep(await declaredDep(id), cliExecContext(), {
    log: say,
  });
  if (opts.json) {
    console.log(
      JSON.stringify({ id, identity: ready.identity, dir: ready.dir }),
    );
    return;
  }
  say(
    `${id} ready at ${ready.identity} (${ready.dir}) in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
};

export default run;
