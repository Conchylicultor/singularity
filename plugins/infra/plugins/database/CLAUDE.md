# database

Embedded Postgres owned by the central runtime. One cluster per host, multiple databases inside (one per worktree, same as before). Replaces user-installed system Postgres.

## Topology

- **Single embedded cluster on the central runtime.** The `central/index.ts` plugin barrel registers an `onReady` that runs `initdb` on first start (writing to `~/.singularity/postgres/data-pg18/`), then spawns `postgres` as a detached child listening on a Unix socket at `~/.singularity/postgres/socket/.s.PGSQL.5433`. Cluster is shared by every worktree backend; isolation comes from per-worktree databases inside the cluster, not separate clusters.
- **Binaries from `embedded-postgres` npm.** The `embedded-postgres` package vendors PG 18 binaries per platform via `@embedded-postgres/<platform>` optionalDependencies. The package only ships `postgres`, `initdb`, and `pg_ctl`. Client tools (`pg_isready`, `psql`) are replaced with `pg.Client` calls; `pg_dump`/`pg_restore`/`pg_dumpall` are PATH-resolved (relying on the user's system PG client install until we bundle our own).
- **Lazy `dylib` symlinks.** The platform tarballs ship versioned dylibs (e.g. `libicudata.77.1.dylib`) but PG's runtime loader expects unversioned aliases. `ensurePgSymlinks()` reads the package's `pg-symlinks.json` manifest and creates the missing symlinks the first time `pgBin()` is called.
- **No PgBouncer (yet).** v1 ships with `max_connections=500` set on `initdb`. With ~7 connections per worktree, that's headroom for ~70 active worktrees. PgBouncer is a v2 follow-up — adding it later is purely additive (introduce a second socket env var, swap the app pool destination).
- **Auto-migrates on first run.** If `data-pg18/` does not exist AND a system PG is reachable on `localhost:5432` AND it has a `singularity` database, `migrate-from-system.ts` runs `pg_dumpall --globals-only` followed by `pg_dump | pg_restore` for each `singularity` and `att-*` database, into the freshly-initdb'd cluster. Sentinel file at `~/.singularity/postgres/.migrating` gates partial failures so a second `./singularity start` doesn't double-migrate.

## Connection routing (server-side)

Worktree backends connect via `server/src/db/client.ts`. After this plugin landed:

- **Default**: all pools (`pool`, `adminPool`, `openShortLivedClient`) connect via Unix socket at `~/.singularity/postgres/socket`, port `5433`, user `singularity`. No `PGHOST`/`PGPORT` env vars needed.
- **Escape hatch**: set `SINGULARITY_USE_SYSTEM_PG=1` to fall back to `PGHOST`/`PGPORT`/`PGUSER` semantics (defaults `localhost:5432`). Also disables the embedded-PG supervisor in central. For users who want to keep using their existing system PG.

`db-fork.ts` (and the build's `waitForDatabase` which shells out to `psql`) explicitly set `PGHOST`/`PGPORT` in subprocess env so libpq tools find the embedded socket.

## Lifecycle

`onReady()` in `internal/supervisor.ts`:
1. Skip entirely if `SINGULARITY_USE_SYSTEM_PG=1`.
2. If `data-pg18/` is partial (no `PG_VERSION`): wipe it.
3. If `data-pg18/` does not exist: run `initdb -D <data> -U singularity --no-locale --encoding UTF8`. (Auto-migration runs after PG is up, fire-and-forget — see below.)
4. If `data-pg18/postmaster.pid` exists from a prior run, ping via `pg.Client`. If alive, skip spawn. If dead, unlink the pidfile.
5. Spawn `postgres -D <data> -k <socket> -p 5433 -c max_connections=500`. Logs piped to `~/.singularity/postgres/postgres.log`.
6. Poll `pg.Client.connect()` with backoff, 30s timeout. Resolve the exported `ready` promise.
7. If fresh, fire-and-forget `migrateFromSystemPg(progress)` — central must bind its HTTP socket within the gateway's ~15s readiness window, so a multi-minute migration runs out-of-band. Status surfaces via `GET /api/database/status` (`migration: "running" | "completed" | "failed"`, plus a progress counter).

`onShutdown()`: SIGTERM → 5s grace → SIGKILL.

Watchdog: a 2s `pg.Client.connect()` check (`.unref()`-ed). If PG dies, log + attempt one re-spawn, then set `crashed: true`. Surfaced via `GET /api/database/status`. We do **not** auto-restart in a tight loop — that would mask persistent failures.

## What this plugin does NOT do

- Manage PgBouncer (deferred to v2).
- Run `CREATE DATABASE` / `DROP DATABASE` on worktree create/destroy — that's still owned by `plugins/conversations/server/internal/db-fork.ts` and the worktree-cleanup plugin. This plugin only manages the cluster.
- Expose a `pg` client. Sibling code that needs PG access continues to import from `@server/db/client`.

## Migration from system PG

`migrate-from-system.ts` is one-shot, gated by `data-pg18/` not existing. The migration:
1. Try a `pg.Client` connect to `localhost:5432`. If unreachable, skip.
2. List databases via `pg.Client`: `singularity` plus any `att-%` / `claude-%`.
3. Restore globals (roles): `pg_dumpall --globals-only --no-role-passwords | psql -h <embedded-socket> -p 5433 -d postgres`.
4. For each DB found, run `pg_dump -Fc --no-owner -h localhost <db> | pg_restore --no-owner -h <embedded-socket> -p 5433 -C -d postgres`. `--no-owner` so restored objects pick up the embedded role (`singularity`) instead of the source role (often `admin`/`postgres`).
5. Verify count of `__singularity_migrations` rows on embedded `singularity`.
6. Remove sentinel; write `migration-completed-at`.

Migration is fire-and-forget (kicked off after PG is ready inside `onReady`) so central can bind its HTTP socket within the gateway's readiness window. Status / progress is surfaced via `GET /api/database/status`.

If any step errors, the sentinel stays in place and `state.migration = "failed"`. The build CLI's `ensureDatabaseReachable` reports the error and exits; user can inspect logs, then `rm <sentinel> <data-pg18>` and re-run. Original system-PG data is read-only throughout — never modified.

## Plugin reference

- Description: Embedded Postgres on the central runtime. Replaces user-installed system PG; one cluster per host, multi-database inside.
- Load-bearing: yes

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Embedded Postgres on the central runtime. Single shared cluster, one DB per worktree. Replaces user-installed system PG.
- Load-bearing: yes
- Exports (server):
  - Types: `PgBinName`
  - Values: `PG_DATA_DIR`, `PG_DIR`, `PG_LOG_FILE`, `PG_MIGRATING_SENTINEL`, `PG_PORT`, `PG_SOCKET_DIR`, `PG_USER`, `pgBin`
- Exports (central):
  - Values: `PG_PORT`, `PG_SOCKET_DIR`, `PG_USER`, `ready`, `useSystemPg`
- Exports (shared):
  - Types: `PgBinName`
  - Values: `ensurePgSymlinks`, `MAX_CONNECTIONS`, `PG_DATA_DIR`, `PG_DIR`, `PG_LOG_FILE`, `PG_MAJOR`, `PG_MIGRATING_SENTINEL`, `PG_MIGRATION_DONE_MARKER`, `PG_PID_FILE`, `PG_PORT`, `PG_SOCKET_DIR`, `PG_USER`, `pgBin`, `useSystemPg`
- Central:
  - `GET /api/database/status`

<!-- AUTOGENERATED:END -->
