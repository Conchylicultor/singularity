# Setup

One-time environment setup for developing Singularity.

## Prerequisites

| Tool       | Version | Install                         |
| ---------- | ------- | ------------------------------- |
| Bun        | >= 1.0  | `brew install oven-sh/bun/bun`  |
| Go         | >= 1.22 | `brew install go`               |
| PostgreSQL | >= 17   | `brew install postgresql@18`    |

## PostgreSQL

Singularity uses a local Postgres server. Each conversation (worktree) gets its own database, forked from `main` via `CREATE DATABASE ... TEMPLATE`.

```sh
brew install postgresql@18
brew services start postgresql@18
createdb singularity
```

The `singularity` database is the head namespace's DB (the app deployed at port 9000 off `main`). It is also the **fork template** — new conversations get their own database cloned from it via `CREATE DATABASE <conv> TEMPLATE singularity`.

Default connection uses Unix-socket trust auth with your OS user — no password needed. Override via env if your setup differs:

- `PGHOST` (default `localhost`)
- `PGPORT` (default `5432`)
- `PGUSER` (default `$USER`)

The server picks which database to connect to via `SINGULARITY_WORKTREE` (set by the gateway).
