import { existsSync, statSync } from "fs";
import { extname, relative, resolve } from "path";
import type { CliAction } from "@plugins/framework/plugins/cli/core";
// The set of extensions this command accepts is READ FROM THE GUARD, not
// re-stated here. The `bun-script` guard denies `bun <file>` for exactly these
// and sends the caller to this command, so the two sets have to be the same
// set — an extension this command refused but the guard denied would leave that
// caller with nowhere to go. One declaration is what makes that unspellable;
// see its docblock. The import sits here, in the deferred implementation, and
// never in `./index.ts`, which `cli:command-declarations-light` measures.
import { MODULE_EXTENSION } from "@plugins/framework/plugins/tooling/plugins/guards/core";
import {
  getWorktreeRoot,
  spawnPassthrough,
} from "@plugins/infra/plugins/spawn/core";

/**
 * Refuse, naming the path, rather than running something else.
 *
 * Every arm is a case where the alternative is silent: bun would happily
 * execute a directory's `index.ts`, a `.json`, or a file in a sibling checkout.
 * Both paths are printed — the one typed and the one it resolved to — because a
 * path that resolved somewhere unexpected is the whole class of mistake here.
 */
function reject(script: string, abs: string, why: string): never {
  console.error(`Cannot run ${script}\n  resolved to ${abs}\n  ${why}`);
  process.exit(1);
}

const run: CliAction<[string, string[]], object> = async (script, args) => {
  const root = await getWorktreeRoot();

  // `./singularity` cd's to the checkout root before exec'ing the CLI, so
  // `process.cwd()` IS the root here: a relative path is repo-root-relative,
  // which is how scripts are written down everywhere in this repo.
  const abs = resolve(process.cwd(), script);

  if (!existsSync(abs)) reject(script, abs, "no such file");
  if (!statSync(abs).isFile()) reject(script, abs, "not a file");

  // A script in a SIBLING checkout would resolve its dependencies from that
  // checkout's tree — the exact failure this command exists to close, so it
  // must not be reachable through the command that closes it.
  const rel = relative(root, abs);
  if (rel.startsWith("..")) {
    reject(script, abs, `outside this checkout (${root})`);
  }

  if (!MODULE_EXTENSION.test(abs)) {
    const ext = extname(abs);
    reject(
      script,
      abs,
      `not a runnable module — expected a .ts/.tsx/.js/.jsx (or .mts/.cts/.mjs/.cjs) file, got ${ext ? `"${ext}"` : "no extension"}`,
    );
  }

  // We are past `ensureDeps()`, which is the entire point: THIS worktree's
  // `node_modules` now exists and matches this branch's lock, so the child's
  // walk-up finds it before it can reach the main checkout's.
  //
  // `stdin: "inherit"` because the child must be indistinguishable from the
  // script the caller would have run by hand; the default `"ignore"` would be a
  // behavior change hiding in a fd, invisible until a script prompts.
  const { exitCode, signalCode } = await spawnPassthrough(
    [process.execPath, abs, ...args],
    { cwd: root, stdin: "inherit" },
  );

  // A signalled child can still report exit 0. Reporting that as success is the
  // absorbed failure this repo bans — the script did not finish, it was killed.
  if (signalCode !== null) {
    console.error(`\n${rel} was killed by ${signalCode}.`);
    process.exit(1);
  }
  // The exit code is the script's answer; this command is a wrapper, not a
  // verdict of its own. `process.exit` rather than `process.exitCode` so a
  // non-zero cannot be overwritten by anything that runs after us.
  if (exitCode !== 0) process.exit(exitCode);
};

export default run;
