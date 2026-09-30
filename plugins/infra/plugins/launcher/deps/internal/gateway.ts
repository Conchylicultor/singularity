import { join } from "node:path";
import { defineDep, type DepTarget } from "@plugins/infra/plugins/deps/deps";
import { build } from "@plugins/infra/plugins/deps/plugins/build/deps";

/** Go's spelling of a target (GOOS / GOARCH). */
function goTarget(target: DepTarget): { GOOS: string; GOARCH: string } {
  const GOARCH =
    target.arch === "x64" ? "amd64" : target.arch === "arm64" ? "arm64" : null;
  if (
    (target.platform !== "darwin" && target.platform !== "linux") ||
    GOARCH === null
  ) {
    throw new Error(
      `the gateway builds for darwin and linux on x64 or arm64, not ${target.platform}/${target.arch}`,
    );
  }
  return { GOOS: target.platform, GOARCH };
}

/**
 * The gateway: `go build` of this checkout's `gateway/` module into the deps
 * cache. Its identity is every Go source plus `go.mod` / `go.sum`, the Go
 * version and the target, so editing a `.go` file (or a new Go) is a new build
 * beside the old one, and `./singularity start` picks it up with no flag.
 *
 * Cross-compiles to every release platform (`targets: "any"`), which is how a
 * release seals it for a Linux server from a Mac. cgo is a function of the
 * TARGET OS, not a blanket 0: the darwin sigaction shim
 * (`gateway/sigterm_darwin.go`) is a cgo file whose pure-Go twin is
 * `//go:build !darwin`, so CGO_ENABLED=0 on a darwin target compiles NEITHER
 * (`undefined: logSigtermSender`) — and Go turns cgo off whenever GOOS/GOARCH
 * differ from the host, so even darwin-arm64 → darwin-x64 needs it explicitly
 * on. Linux takes the pure-Go twin and gets 0: a static binary that depends on
 * no glibc version on the production host.
 *
 * Admitted like any install (one background unit): a cold `go build` is tens
 * of seconds of CPU.
 */
export const gatewayBinary = defineDep({
  id: "gateway-binary",
  owner: "infra/launcher",
  description:
    "The Go gateway: the front door on port 9000 that routes every namespace and supervises Postgres, PgBouncer and the backends",
  sizeHint: "≈15 MB",
  source: build({
    inputs: ["gateway/**/*.go", "gateway/go.mod", "gateway/go.sum"],
    tool: { versionArgv: ["go", "version"] },
    output: "gateway",
    targets: "any",
    run: async (ctx) =>
      ctx.run(["go", "build", "-o", ctx.output, "."], {
        cwd: join(ctx.root, "gateway"),
        env: {
          ...process.env,
          ...goTarget(ctx.target),
          CGO_ENABLED: ctx.target.platform === "linux" ? "0" : "1",
        },
        timeoutMs: 15 * 60_000,
      }),
  }),
  updates: { none: "built from this checkout's own source" },
  bundle: "required",
});
