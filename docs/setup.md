# Setup

One-time environment setup for developing Singularity.

## Prerequisites

| Tool                | Version | Install                        |
| ------------------- | ------- | ------------------------------ |
| Bun                 | >= 1.0  | `brew install oven-sh/bun/bun` |
| Go                  | >= 1.22 | `brew install go`              |
| Postgres client CLI | 18      | `brew install postgresql@18`   |

**Do not run as root.** Postgres' `initdb` refuses to run as the root OS user, so the embedded cluster — and therefore every backend behind it — cannot start. `./singularity start` and a released bundle's `launch` both refuse outright rather than fail downstream. This bites on fresh servers in particular: the deploy plugin defaults `sshUser` to `root`, so create a non-root user and run as them (`adduser --disabled-password --gecos '' singularity`, `chown -R` the install dir, then `su - singularity`).

The Postgres **server** is bundled (`embedded-postgres` ships `postgres` / `initdb` / `pg_ctl`). The Postgres **client tools** (`pg_dump`, `pg_restore`, `pg_dumpall`) are not bundled yet and must be on PATH — they're used to fork worktree databases. They'll be bundled in a follow-up so this prerequisite goes away.

## Postgres

Singularity ships an embedded Postgres 18 cluster, supervised by the gateway — see [`plugins/database/`](../plugins/database/CLAUDE.md). Binaries come from `@embedded-postgres/<platform>` (installed via `bun install`); `initdb` runs on first start, the cluster lives in `~/.singularity/postgres/data-pg18/`, and `postgres` listens on a Unix socket at `~/.singularity/postgres/socket` on port `5433`.

The base database is called `singularity`, and the script that starts the cluster creates it — empty, on every start, so you never create it yourself and a deleted one comes back. The first backend to boot against it applies the migrations.

Each conversation (worktree) gets its own database inside the same cluster, forked from `singularity` at conversation-creation time via `pg_dump | pg_restore`. The default user is `singularity` with peer/trust auth on the Unix socket — no password to manage.

### Using system PG instead of embedded

Edit `~/.singularity/state/db-config/database.json` (auto-generated on first `./singularity start`):

```json
{
  "connection": {
    "host": "localhost",
    "port": 5432,
    "user": "your-username"
  },
  "services": []
}
```

An empty `services` array disables the gateway's embedded-PG supervisor. The `connection` block tells the server and CLI how to reach your system PG. Then restart the gateway with `./singularity start --force`.

In this mode the cluster is yours, not the app's, so nothing provisions inside it: you're responsible for `brew install postgresql@18 && brew services start postgresql@18 && createdb singularity`.

## Git hooks

After cloning, point git at the repo's hooks directory once per clone:

```sh
git config core.hooksPath .githooks
```

`core.hooksPath` lives in `.git/config` (not tracked), so it cannot be committed. Setting it once applies across every worktree of that clone. The `.githooks/prepare-commit-msg` hook auto-stamps commits made inside a Claude pane with a `Singularity-Conversation` trailer, so the server can attribute commits to the conversation that authored them.

## First run

```sh
./singularity start              # compiles and starts the gateway, and brings up Postgres
./singularity build --allow-main # builds the app and deploys it
```

The app is then at <http://singularity.localhost:9000>. `start` is a one-time,
system-level step — it leaves a daemon running, and it does not survive a
reboot, so run it again after one.
