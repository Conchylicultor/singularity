import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * Compiled copies of the signal tap's tiny C shim, one per
 * (source hash, architecture): `signal-origin-<sha8>-<arch>.{dylib,so}`.
 *
 * Content-addressed on the `.c` source, so deleting the tree costs one `cc`
 * invocation on the next arm — and a machine with no compiler simply degrades to
 * "no attribution", which is already the fail-open contract.
 */
export const signalOriginNative = defineDataDir({
  kind: "cache",
  name: "signal-origin-native",
  owner: "packages/signal-origin",
  description:
    "Compiled signal-tap dylibs, content-addressed on the C source and architecture",
  reclaim: { kind: "safe" },
});

export default [signalOriginNative];
