import { defineDep } from "@plugins/infra/plugins/deps/deps";
import { build } from "@plugins/infra/plugins/deps/plugins/build/deps";

/** The C compiler: `$CC` when set, else `cc` — resolved when the declaration loads. */
const cc = process.env.CC ?? "cc";

/**
 * The signal tap's C shim, compiled from this checkout's `native/` source into
 * the deps cache. Its identity is the source's hash, the compiler's version
 * and the platform/arch, so editing the `.c` (or a new Xcode) rebuilds it
 * beside the old one, and parallel worktrees on one identity share one build
 * under the engine's lock.
 *
 * It takes no host admission: it is one ~200 ms compile of one file, awaited
 * on the way INTO every build / check / push, where queuing for a background
 * unit would hold the op behind the whole background lane.
 */
export const signalOriginShim = defineDep({
  id: "signal-origin-shim",
  owner: "packages/signal-origin",
  description:
    "The native SA_SIGINFO signal tap build / check / push arm to record who sent a fatal signal",
  sizeHint: "≈50 KB",
  source: build({
    inputs: ["plugins/packages/plugins/signal-origin/native/**"],
    tool: { versionArgv: [cc, "--version"] },
    output: `signal-origin.${process.platform === "darwin" ? "dylib" : "so"}`,
    admission: {
      none: "one ~200 ms compile of one C file, awaited on the way into every op",
    },
    run: async (ctx) =>
      ctx.run(
        [
          cc,
          "-O2",
          "-fPIC",
          "-std=c11",
          ctx.target.platform === "darwin" ? "-dynamiclib" : "-shared",
          "-o",
          ctx.output,
          "plugins/packages/plugins/signal-origin/native/signal-origin.c",
        ],
        { cwd: ctx.root, env: { ...process.env }, timeoutMs: 120_000 },
      ),
  }),
  updates: { none: "built from this checkout's own source" },
});
