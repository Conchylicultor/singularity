import { createHash } from "node:crypto";
import { join } from "node:path";
import { depsCacheDir, depsLocksDir } from "../../data-dirs";
import type { Dep, DepSource } from "./dep";

/**
 * Where the engine keeps installs and locks. The real store is the declared
 * data dirs; a test hands its own temp dirs. (Host admission is not the
 * store's: it comes with the caller's `ExecContext`, `exec.admit`.)
 */
export interface DepStore {
  /** `<cacheRoot>/<id>/<identity>/…` */
  readonly cacheRoot: string;
  /** `<locksRoot>/<id>-<identity>.lock` */
  readonly locksRoot: string;
}

export function defaultStore(): DepStore {
  return {
    cacheRoot: depsCacheDir.ensure(),
    locksRoot: depsLocksDir.ensure(),
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
  return sourceIdentity(dep.source, root);
}

/** The identity of one source (a declaration's own, or one for another target). */
export async function sourceIdentity(
  source: DepSource,
  root: string,
): Promise<{ identity: string; inputs: Readonly<Record<string, string>> }> {
  const inputs = await source.identityInputs(root);
  return { identity: identityOf(source.kind, inputs), inputs };
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
  /** `holds/<holder>`: a durable reference from outside any checkout (see `holdDep`). */
  readonly holds: string;
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
    holds: join(root, "holds"),
    lock: join(store.locksRoot, `${id}-${identity}.lock`),
  };
}
