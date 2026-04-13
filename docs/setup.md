# Setup

One-time environment setup for developing Singularity.

## Prerequisites

| Tool       | Version | Install                         |
| ---------- | ------- | ------------------------------- |
| Bun        | >= 1.0  | `brew install oven-sh/bun/bun`  |
| Go         | >= 1.22 | `brew install go`               |
| PostgreSQL | >= 17   | `brew install postgresql@18`    |

## PostgreSQL

Singularity uses a local Postgres server. Each conversation (worktree) gets its own database, forked from the `singularity` database at conversation-creation time via `pg_dump | pg_restore`.

```sh
brew install postgresql@18
brew services start postgresql@18
createdb singularity
```

The `singularity` database is the main namespace's DB (the app served at `singularity.localhost:9000` off `main`) and the **fork source**. New conversations get their own database with a point-in-time snapshot of `singularity`'s data via `pg_dump -Fc singularity | pg_restore -d <conv>`. `pg_dump` works against a live DB, so the main backend stays connected throughout.

Default connection uses Unix-socket trust auth with your OS user — no password needed. Override via env if your setup differs:

- `PGHOST` (default `localhost`)
- `PGPORT` (default `5432`)
- `PGUSER` (default `$USER`)

The server picks which database to connect to via `SINGULARITY_WORKTREE` (set by the gateway).
