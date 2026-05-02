# Setup

One-time environment setup for developing Singularity.

## Prerequisites

| Tool                | Version | Install                        |
| ------------------- | ------- | ------------------------------ |
| Bun                 | >= 1.0  | `brew install oven-sh/bun/bun` |
| Go                  | >= 1.22 | `brew install go`              |
| Postgres client CLI | 18      | `brew install postgresql@18`   |

The Postgres **server** is bundled (`embedded-postgres` ships `postgres` / `initdb` / `pg_ctl`). The Postgres **client tools** (`pg_dump`, `pg_restore`, `pg_dumpall`) are not bundled yet and must be on PATH — they're used to fork worktree databases and to run the one-time auto-migration from system PG. They'll be bundled in a follow-up so this prerequisite goes away.

## Postgres

Singularity ships an embedded Postgres 18 cluster managed by the central runtime — see [`plugins/infra/plugins/database/`](../plugins/infra/plugins/database/CLAUDE.md). Binaries come from `@embedded-postgres/<platform>` (installed via `bun install`); `initdb` runs on first start, the cluster lives in `~/.singularity/postgres/data-pg18/`, and `postgres` listens on a Unix socket at `~/.singularity/postgres/socket` on port `5433`.

Each conversation (worktree) gets its own database inside the same cluster, forked from `singularity` at conversation-creation time via `pg_dump | pg_restore`. The default user is `singularity` with peer/trust auth on the Unix socket — no password to manage.

### Auto-migration from system PG

If you already have a system Postgres install with a `singularity` database (the previous setup), the central runtime auto-detects it on first start (when `~/.singularity/postgres/data-pg18/` does not yet exist) and migrates `singularity` plus every `att-*` / `claude-*` worktree DB into the embedded cluster via `pg_dump | pg_restore`. One-time, ~30s plus a few seconds per worktree DB. Original system data is read-only throughout — never modified.

If migration fails partway, the sentinel file `~/.singularity/postgres/.migrating` blocks subsequent starts so you can inspect logs (`~/.singularity/postgres/postgres.log`). To retry, remove the sentinel and the half-populated `data-pg18/` directory.

### Escape hatch: keep using system PG

Set `SINGULARITY_USE_SYSTEM_PG=1` in the environment that runs `./singularity start`. This:

- Disables the embedded-PG supervisor in the central runtime.
- Reverts `server/src/db/client.ts` to the previous `PGHOST`/`PGPORT`/`PGUSER` semantics (defaults `localhost:5432`).
- Skips the auto-migration check.

In this mode you're responsible for `brew install postgresql@18 && brew services start postgresql@18 && createdb singularity` as before.

## Git hooks

After cloning, point git at the repo's hooks directory once per clone:

```sh
git config core.hooksPath .githooks
```

`core.hooksPath` lives in `.git/config` (not tracked), so it cannot be committed. Setting it once applies across every worktree of that clone. The `.githooks/prepare-commit-msg` hook auto-stamps commits made inside a Claude pane with a `Singularity-Conversation` trailer, so the server can attribute commits to the conversation that authored them.
