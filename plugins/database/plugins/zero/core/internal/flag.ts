// The single opt-in switch for the entire (frozen) Zero pilot. Default OFF —
// gated on an EXPLICIT env flag, NOT on presence of the `@rocicorp/zero`
// dependency (which is always committed for the client bundle, so a presence
// gate would silently auto-start the sidecar for everyone on merge).
//
// This predicate is the zero plugin's own single source of truth for the fence.
// It is consulted in exactly two places, both server/build-time (never the
// browser — the function is never called client-side even though `core` is a
// cross-runtime barrel):
//   1. `zeroCacheSpec()` (launcher boot) — omits the worktree spec's `zeroCache`
//      block when off, so `spec.json` is byte-identical to a pre-Zero spec and
//      the gateway never spawns the sidecar.
//   2. The cache-service install-time `provision/` step — skips building the
//      native @rocicorp/zero-sqlite3 addon and downloading the Node 24 runtime
//      when off, so a disabled Zero costs nothing to install.
//
// Lives in `core` (no runtime deps) so both the server and the alias-free-ish
// postinstall provision context can reach it — the same home as ZERO_CACHE_PORT.
export function zeroCacheEnabled(): boolean {
  return process.env.SINGULARITY_ZERO_CACHE === "1";
}
