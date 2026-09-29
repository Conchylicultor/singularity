import { createHash } from "node:crypto";
import { join } from "node:path";
import { withHostGrant } from "@plugins/infra/plugins/host/plugins/host-admission/server";
import { depsCacheDir, depsLocksDir } from "../../data-dirs";
import type { Dep, DepSource } from "./dep";

/**
 * Where the engine keeps installs and locks, and how a big install is admitted
 * to the host. The real store is the declared data dirs; a test hands its own
 * temp dirs and an admission that admits at once.
 */
export interface DepStore {
  /** `<cacheRoot>/<id>/<identity>/…` */
  readonly cacheRoot: string;
  /** `<locksRoot>/<id>-<identity>.lock` */
  readonly locksRoot: string;
  /** Runs an install body under the host's CPU admission. */
  readonly admit: <T>(fn: () => Promise<T>) => Promise<T>;
}

export function defaultStore(): DepStore {
  return {
    cacheRoot: depsCacheDir.ensure(),
    locksRoot: depsLocksDir.ensure(),
    // One background unit: an install yields to builds and interactive work.
    admit: (fn) => withHostGrant({ lane: "background", max: 1 }, () => fn()),
  };
}

/**
 * The identity of a set of declared inputs: the kind plus every input, hashed.
 * Nothing is typed in by hand, so a change in any input is a new identity.
 */
export function identityOf(
  kind: string,
  inputs: Readonly<Record<string, string>>,
): string {
  const entries = Object.keys(inputs)
    .sort()
    .map((key) => [key, inputs[key]]);
  const canonical = JSON.stringify({ kind, inputs: entries });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/** A dependency's current identity, derived from the checkout at `root`. */
export async function currentIdentity(
  dep: Dep<DepSource>,
  root: string,
): Promise<{ identity: string; inputs: Readonly<Record<string, string>> }> {
  const inputs = await dep.source.identityInputs(root);
  return { identity: identityOf(dep.source.kind, inputs), inputs };
}

/** The files of one `(id, identity)` install. */
export interface InstallPaths {
  readonly root: string;
  readonly env: string;
  readonly ready: string;
  readonly installing: string;
  readonly failed: string;
  readonly log: string;
  readonly lastUsed: string;
  readonly lock: string;
}

export function installPaths(
  store: DepStore,
  id: string,
  identity: string,
): InstallPaths {
  const root = join(store.cacheRoot, id, identity);
  return {
    root,
    env: join(root, "env"),
    ready: join(root, "ready.json"),
    installing: join(root, "installing.json"),
    failed: join(root, "failed.json"),
    log: join(root, "install.log"),
    lastUsed: join(root, "last-used"),
    lock: join(store.locksRoot, `${id}-${identity}.lock`),
  };
}
