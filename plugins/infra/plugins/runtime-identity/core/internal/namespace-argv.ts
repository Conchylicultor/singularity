import {
  asNamespace,
  type Namespace,
} from "@plugins/infra/plugins/namespace/core";
import { runtimeNamespace } from "./runtime-identity";

// ── The `--namespace <ns>` argv contract, spelled once ───────────────────────
//
// Every process that serves a namespace is TOLD it by its spawner, on argv:
// the gateway spawns a backend with it, and a backend spawns its sentinel worker
// thread with it (a worker thread shares no module state with its spawner, so it
// starts with nothing declared). Both ends read and write the flag through here,
// so the spelling and the "given with no value" error cannot drift between them.

const FLAG = "--namespace";

/**
 * The argv a spawner hands a child that must serve THIS process's namespace.
 * Throws (via `runtimeNamespace()`) when this process never declared one.
 */
export function namespaceArgv(): string[] {
  return [FLAG, runtimeNamespace()];
}

/**
 * The namespace named by `--namespace <ns>` in `argv`, or `undefined` when the
 * flag is absent — the caller decides what a missing flag means for it, and
 * names its own spawner in the error.
 *
 * Throws when the flag is present with no value: that is never a choice, only a
 * broken spawn.
 */
export function readNamespaceArgv(
  argv: readonly string[],
): Namespace | undefined {
  const i = argv.indexOf(FLAG);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(
      `[boot] ${FLAG} was given with no value. It names the namespace this ` +
        `process serves — its database, config dir and log tree — so starting ` +
        `without one would pick an app at random.`,
    );
  }
  return asNamespace(value);
}
