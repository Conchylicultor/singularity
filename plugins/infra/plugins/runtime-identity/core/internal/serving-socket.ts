// ── The serving socket: which Unix socket THIS BACKEND answers on ────────────
//
// The second thing the gateway hands a backend at its entry point, beside its
// namespace. Only the gateway knows it: a backend alternates between
// `<ns>.sock` and `<ns>.next.sock` across hot restarts, so the path cannot be
// derived from the namespace.
//
// It arrives as `--socket <path>` on argv. It used to arrive as SOCKET_PATH in
// the environment, and an environment variable reaches every descendant: the
// tmux server when a backend was the first to talk to it, a toolbar build, a
// supervised-exec child, the release and deploy CLIs — each of them "knew" a
// socket that belonged to somebody else, and an exec child that bound it would
// have collided with the live backend. Deleting the variable after reading it
// does not help: a Bun child with no explicit `env` receives the environment the
// process STARTED with, whatever `process.env` says by then.
//
// TRANSITION. The gateway sends `--socket` only for a spec.json that asks for
// it (`"socketTransport": "argv"`, written by every build from this change on),
// and only once it is itself restarted with `./singularity start`. Until then —
// an old gateway, or a spec an older build wrote — the path still comes in the
// environment, and this module is the one place allowed to read it there
// (`launcher:per-process-env-on-argv` holds the list). The fallback goes when
// the gateway's legacy branch goes.
//
// Design: research/2026-09-15-global-backend-env-leak-followups.md

const FLAG = "--socket";
const LEGACY_ENV = "SOCKET_PATH";

let declared: string | undefined;

function argvSocket(argv: readonly string[]): string | undefined {
  const i = argv.indexOf(FLAG);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(
      `[boot] ${FLAG} was given with no value. It names the Unix socket this ` +
        `backend serves on; the gateway dials exactly that path.`,
    );
  }
  return value;
}

/**
 * Read the socket the gateway handed this serving backend, record it, and
 * return it. Called ONCE, by each serving entry point, just before it binds
 * (`server-core/bin/index.ts`, `central-core/bin/index.ts`). An `exec` child
 * serves nothing and never calls it.
 *
 * Throws when neither `--socket` nor the transition fallback names one. A
 * backend with no socket is unreachable, so booting on would only fail later
 * and less clearly.
 */
export function readServingSocket(
  argv: readonly string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
): string {
  let path = argvSocket(argv);
  if (path === undefined) {
    path = env[LEGACY_ENV];
    if (!path) {
      throw new Error(
        `[boot] this backend was spawned without ${FLAG} <path>. The gateway ` +
          `passes it (gateway/worktree.go); a hand-run backend has to pass it ` +
          `itself. It names the Unix socket this backend serves on.`,
      );
    }
    console.warn(
      `[boot] socket path read from ${LEGACY_ENV} in the environment, not from ` +
        `${FLAG}: the gateway, or this namespace's spec.json, predates the argv ` +
        `contract. Every process this backend starts will inherit the path. ` +
        `Fix: rebuild this namespace, and restart the gateway with ./singularity start.`,
    );
  }
  if (declared !== undefined && declared !== path) {
    throw new Error(
      `[runtime-identity] this process already serves on "${declared}" and ` +
        `cannot be redeclared to serve on "${path}".`,
    );
  }
  declared = path;
  return path;
}

/**
 * The socket this backend serves on, for code that must reach its own backend
 * over HTTP. Throws when this process never declared one: a CLI, a test or an
 * `exec` child serves nothing, and handing it some other process's socket is
 * the leak this module exists to end.
 */
export function servingSocketPath(): string {
  if (declared === undefined) {
    throw new Error(
      "[runtime-identity] this process serves on no socket. Only a " +
        "gateway-spawned backend has one, declared by its entry point via " +
        "readServingSocket(); an exec child, a CLI and a test do not.",
    );
  }
  return declared;
}

/** Drop the declaration. TEST ONLY. */
export function resetServingSocketForTest(): void {
  declared = undefined;
}
