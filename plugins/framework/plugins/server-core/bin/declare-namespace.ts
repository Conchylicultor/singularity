import { asNamespace } from "@plugins/infra/plugins/namespace/core";
import { declareRuntimeNamespace } from "@plugins/infra/plugins/runtime-identity/core";

// ── The FIRST thing a backend does: say which namespace it is ────────────────
//
// Imported as the literal first statement of `bin/index.ts`, before the
// `server-core/core` barrel — so it runs before `./active-runtime` reaches
// `plugins-active.ts` (whose top level selects the registry) and before
// `config_v2/server/internal/config-dir.ts`, which resolves its directory at
// module eval and throws without an identity.
//
// The value arrives on ARGV, from the one process that knows it: the gateway
// spawns `… bin/index.ts --namespace <ns>` (`gateway/worktree.go`). It used to
// arrive as `SINGULARITY_WORKTREE` in the environment, and an environment
// variable reaches every descendant forever — which is how agent shells, and
// every `build` / `check` / `test` they ran, came to believe they were main.
//
// Design: research/2026-09-15-global-retire-ambient-worktree-env-runtime-identity.md

const FLAG = "--namespace";

function argvNamespace(): string | undefined {
  const i = process.argv.indexOf(FLAG);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(
      `[boot] ${FLAG} was given with no value. It names the namespace this ` +
        `backend serves — its database, config dir and log tree — so booting ` +
        `without one would pick an app at random.`,
    );
  }
  return value;
}

const fromArgv = argvNamespace();
if (fromArgv === undefined) {
  throw new Error(
    `[boot] this backend was spawned without ${FLAG} <ns>. The gateway passes ` +
      `it (gateway/worktree.go); a hand-run backend has to pass it itself. It ` +
      `names the namespace this process serves — its database, its config dir ` +
      `and its log tree.`,
  );
}
declareRuntimeNamespace(asNamespace(fromArgv));
