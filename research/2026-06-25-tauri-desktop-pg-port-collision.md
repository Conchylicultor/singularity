# Desktop (Tauri) embedded Postgres fixed-port collision

## Context

The desktop release bundles an embedded Postgres that opens a **loopback TCP
listener** (`listen_addresses=127.0.0.1`) so Zero's `zero-cache` can replicate
over logical replication (it can't traverse PgBouncer nor a Unix socket). That
TCP port is governed by `SINGULARITY_PG_PORT`, defaulting to **5433**.

The Tauri shell (`tauri/src-tauri/src/lib.rs`) spawns the bundled `launch`
binary with `SINGULARITY_DIR`, `SINGULARITY_PG_SOCKET_DIR`, and `PORT` — but
**not** `SINGULARITY_PG_PORT`. So `resolvePgPort()` falls back to 5433 and PG
binds `127.0.0.1:5433` every time. Consequences:

- Running the desktop app next to a dev cluster (also 5433), or a second
  desktop instance of another composition, fails with
  `could not bind IPv4 address "127.0.0.1": Address already in use`. PG never
  starts, the backend never registers, and the gateway serves "unknown
  worktree".
- Works only on a clean end-user machine with nothing else on 5433.

The web **preview** path already solves this: `preview-manager.ts` hands each
launched instance a free `SINGULARITY_PG_PORT`, so previews never collide. The
desktop launch path simply needs the same treatment. Setting that one env var
propagates through the entire stack with no other code changes — the whole
chain already reads `PG_PORT` from `SINGULARITY_PG_PORT`.

## How the env var propagates (already wired — no changes needed downstream)

Setting `SINGULARITY_PG_PORT` before the `launch` binary boots flows everywhere:

1. `plugins/database/plugins/embedded/shared/internal/paths.ts:10-20` —
   `resolvePgPort()` reads it; exports the frozen `PG_PORT`.
2. `plugins/database/plugins/embedded/scripts/start.ts:167-187` —
   `pg_ctl start -o "-p ${PG_PORT} -c listen_addresses=127.0.0.1 ..."` binds it
   (both the Unix socket filename `.s.PGSQL.${PG_PORT}` and the TCP listener).
3. `plugins/database/plugins/pgbouncer/scripts/start.ts:17-21,86` — upstream
   `host=<sock> port=${PG_PORT}` so PgBouncer dials the right port.
4. `plugins/infra/plugins/launcher/server/internal/boot.ts:164` —
   `zeroCacheSpec().upstreamDb = postgresql://…@127.0.0.1:${PG_PORT}/…` so Zero
   replicates from the right port.
5. `plugins/infra/plugins/launcher/bin/teardown.ts:64-67` — already reads
   `SINGULARITY_PG_PORT` and forwards it as the `pgPort` TCP backstop to
   `teardownSelfContainedApp`; today it's unset so the backstop defaults to
   5433. With the fix it receives the real port.

The gateway daemon spreads `{ ...process.env }` when spawning the backend
(`boot.ts:400`), so the var reaches every supervised process.

## The fix — `tauri/src-tauri/src/lib.rs`

The Tauri shell is the spawner (the Rust analogue of `preview-manager.ts`), so
it picks the free PG port and passes it on **both** the launch and teardown
`Command` builds. The port must be chosen **once** and stored in `StackCtx` so
teardown signals the same instance launch brought up.

### 1. Pick a free loopback TCP port (Rust idiom)

Add a helper that binds an ephemeral port and reads it back — the OS guarantees
it's free at bind time, then we drop the listener so PG can take it:

```rust
/// Ask the OS for a free loopback TCP port (bind :0, read the assignment, release).
/// Mirrors how the web preview path hands each instance its own SINGULARITY_PG_PORT,
/// so the embedded Postgres never collides with a dev cluster or another instance.
fn pick_free_port() -> Option<u16> {
    std::net::TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
}
```

(Chosen over the preview path's scan-from-a-floor connect-probe: `bind(":0")`
is the idiomatic, race-minimal Rust way — the OS hands back a guaranteed-free
port rather than probing a range. The contract we mirror is "give the instance
its own free `SINGULARITY_PG_PORT`," not the exact JS scan mechanism.)

### 2. Choose the port in `setup` and store it on `StackCtx`

- Add `pg_port: u16` to `struct StackCtx` (after `port`).
- In `setup`, after computing `port`:
  ```rust
  let pg_port = pick_free_port().expect("equin: no free TCP port for embedded Postgres");
  ```
- Populate it in the `app.manage(StackCtx { … })` call.

### 3. Pass it to the `launch` command

In the off-thread spawn (currently lines 103-107), add one env line:

```rust
let status = Command::new(bundle_dir.join("launch"))
    .env("SINGULARITY_DIR", &data_dir)
    .env("SINGULARITY_PG_SOCKET_DIR", &socket_dir)
    .env("PORT", port.to_string())
    .env("SINGULARITY_PG_PORT", pg_port.to_string())   // ← added
    .status();
```

`pg_port` must be captured into the spawned closure (it's `Copy`, so add it to
the `move ||` capture set alongside `port`).

### 4. Pass it to the `teardown` command

In the `RunEvent::Exit` handler (currently lines 129-133):

```rust
let _ = Command::new(ctx.bundle_dir.join("teardown"))
    .env("SINGULARITY_DIR", &ctx.data_dir)
    .env("SINGULARITY_PG_SOCKET_DIR", &ctx.socket_dir)
    .env("PORT", ctx.port.to_string())
    .env("SINGULARITY_PG_PORT", ctx.pg_port.to_string())   // ← added
    .status();
```

### 5. Update the README caveat

`tauri/README.md:89-95` currently documents this exact bug as a known
limitation. Replace it with a one-line note that the shell now hands the
embedded Postgres a free `SINGULARITY_PG_PORT` per launch (mirroring the web
preview path), so it coexists with a dev cluster / other instances.

## Known edge case (acceptable, pre-existing robustness)

The HTTP `port` is fixed (baked into `RELEASE.json`); the `gateway_up(port)`
probe skips `launch` entirely if a prior crashed session's detached daemons are
still listening. In that reattach case the freshly-picked `pg_port` is unused
(PG is already on its old port), and teardown would pass a non-matching backstop
port. This is harmless: teardown's authoritative stop is the **postmaster
pidfile** under the data root, not the TCP backstop. The backstop only matters
when the pidfile is missing — already a pre-existing failure class. No extra
persistence is warranted.

## Files to modify

- `tauri/src-tauri/src/lib.rs` — add `pick_free_port()`, add `pg_port` to
  `StackCtx`, set `SINGULARITY_PG_PORT` on both `Command` builds. (~12 lines)
- `tauri/README.md` — update the known-limitation note (lines ~89-95).

No TypeScript/plugin changes — the entire consumption chain is already
`SINGULARITY_PG_PORT`-aware.

## Verification

1. **Compiles on a Rust host:**
   ```bash
   cargo check --manifest-path tauri/src-tauri/Cargo.toml
   ```
   (Matches the recent `feat(tauri): compile + verify desktop release target on
   a Rust host` workflow.)

2. **Coexistence smoke test (manual, on a machine that can build the desktop
   target):** with the dev cluster running (PG on 5433), build + launch the
   desktop app. Before the fix it dies with `Address already in use`; after, it
   boots — embedded PG binds a high ephemeral port, the backend registers, and
   the webview loads `http://localhost:<port>/`. Confirm via the PG log under
   the app-data dir that `-p <ephemeral>` was used, or `lsof -nP -iTCP -sTCP:LISTEN`
   showing the desktop PG on a non-5433 port while the dev cluster keeps 5433.

3. **Clean teardown:** quit the app; confirm the embedded PG/gateway daemons
   stop (no orphaned process on the ephemeral port) — pidfile teardown handles
   this regardless of the backstop port.
