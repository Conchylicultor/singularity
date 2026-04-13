# DB migrations explained

A plain-language walkthrough of how the migration system works, why it looks the way it does, and what we'd reconsider if we rebuilt it today.

## What migrations are

Your app has tables. Tables have a shape — columns, types, constraints. As the code evolves, that shape needs to change: a new table appears, a column gets added, a constraint gets tightened. The Postgres database doesn't automatically know about these changes just because you edited your code; something has to actually run `CREATE TABLE …` or `ALTER TABLE …` against the live database.

A **migration** is a `.sql` file that describes one such change. Migrations live in `server/src/db/migrations/`. There's one per schema change, in chronological order. Running all of them in order, against an empty database, reproduces the current shape of your tables.

## What "applied" means

If you ran 10 migrations against a database, that database has been modified 10 times. You don't want to run those same 10 again next time the server starts — the first one would fail (`CREATE TABLE x` → "x already exists"), or worse, silently re-apply a data change.

So the database itself keeps a little bookkeeping table that records which migrations have already run. On every server start, the migration runner:

1. Reads that bookkeeping table.
2. Looks at the `.sql` files on disk.
3. Runs only the files that aren't recorded as applied yet.

In our system, that bookkeeping table is called `__singularity_migrations`. One row per applied migration.

## The drizzle leftover

Drizzle is the ORM library (the TypeScript helper that turns `schema.ts` into SQL). Older versions of this project used **drizzle's own built-in migration runner**, which kept its *own* bookkeeping table called `drizzle.__drizzle_migrations`.

Then, in commit `8aac5ba`, the project switched to a custom runner with a different bookkeeping table (`__singularity_migrations`) and a different filename format.

For a while, any old database carried **two** bookkeeping tables:
- `drizzle.__drizzle_migrations` — old, unused, leftover from before the cutover.
- `__singularity_migrations` — new, the one we actually read.

The old one is inert — nothing reads from it anymore. But its presence previously confused the runner into triggering a buggy "bootstrap" branch that silently marked new migrations as applied without running them. That's been removed. As a defensive measure, `plugins/conversations/server/internal/db-fork.ts` now runs `DROP SCHEMA IF EXISTS drizzle CASCADE` on every freshly forked worktree DB, so no forks inherit the leftover.

## FAQ

### 1. Why our own migration table instead of drizzle's built-in?

The reason is in the commit that introduced it: `8aac5ba DB migrations: hash-based filenames for parallel-agent merges`.

Drizzle's built-in system numbers migrations sequentially: `0000_foo.sql`, `0001_bar.sql`, `0002_baz.sql`. That works fine for a single developer. It breaks for this project's model, where multiple agents work in parallel worktrees.

Concrete scenario:
- Main is at `0003_add_todos.sql`.
- Agent A branches off, adds a column, drizzle-kit generates `0004_add_priority.sql`.
- At the same time, Agent B branches off, adds a table, drizzle-kit generates `0004_add_tags.sql`.
- Both merge into main. Now there are **two files named `0004_*`** in the same folder. Drizzle's runner can't handle that — filenames are supposed to be unique, and the integer ordering is ambiguous.

The custom system fixes this by naming files `YYYYMMDD_HHMMSS_<contenthash>__<slug>.sql`. The hash is derived from the migration's SQL, so two different migrations always get different filenames even if they were generated at the same timestamp. Ordering is still deterministic (by timestamp prefix), and merges never collide.

Because the filenames are different from drizzle's format, drizzle's runner can't read them anyway, so we needed our own bookkeeping table that tracks by hash instead of sequence number. `__singularity_migrations` exists to store those hashes.

Secondary benefits:

- Our runner is ~60 lines we can read and modify, vs. drizzle's runner which is a library with its own assumptions.
- We can add project-specific behavior (like the drift warning) without patching drizzle.

### 2. Can we clean up databases to have only one migration table?

Yes, trivially:

```bash
# Main DB
psql -d singularity -c 'DROP SCHEMA IF EXISTS drizzle CASCADE'

# Every worktree DB
for db in $(psql -d postgres -tAc "SELECT datname FROM pg_database WHERE datname LIKE 'claude-%'"); do
  psql -d "$db" -c 'DROP SCHEMA IF EXISTS drizzle CASCADE'
done
```

The first line was already run as part of the earlier cleanup. The second loop sweeps existing worktree DBs. After that, no database in the system contains `drizzle.__drizzle_migrations` anywhere.

Since `db-fork.ts` drops the drizzle schema on every new fork, nothing re-introduces it even if someone later forks from a source that somehow has it again.

### 3. If forking dropped the migrations table entirely, so all migrations re-run...

This would only simplify things if we also **stopped copying data** during fork. Otherwise it breaks.

The fork currently does `pg_dump | pg_restore` — it copies **schema + data + migration bookkeeping**. If we dropped only the bookkeeping and kept the schema + data, the runner would try to re-run `0001_volatile_orphan.sql` which does `CREATE TABLE smoketest …`. Drizzle-generated DDL uses `CREATE TABLE IF NOT EXISTS`, so that specific statement happens to be idempotent. But drizzle's `ALTER TABLE ADD COLUMN`, `ALTER TABLE DROP COLUMN`, `CREATE INDEX` — these are **not** wrapped in `IF NOT EXISTS`. Re-running them against an already-migrated DB throws.

So the interesting design is: **fork = create an empty DB + run all migrations from scratch**. That would genuinely simplify things:

- One code path: "apply every migration". No "skip the ones that ran before main's snapshot."
- No dependency on what main's schema looks like right now.
- Migrations become the sole source of truth for schema. You can reproduce any worktree's schema from git alone.
- The bootstrap bug (and the whole class of "DB state vs. migration state inconsistency" bugs) can't exist because there's no inherited state.

Tradeoffs:

- **Data in the forked DB.** Today, a worktree starts with a realistic copy of main's data, which is convenient for testing. With a fresh-DB fork, every worktree starts empty and needs seeding somehow (seed script, factory helpers, or "do it in the UI").
- **Fork speed, eventually.** Today, fork time is roughly the size of the data. With fresh-DB + run-migrations, fork time scales with the *number* of migrations. If the project ever has 200 migrations, that's ~200 round-trips on every new worktree. `pg_dump` is faster once you have nontrivial schema.

For this project right now, data is near-empty and migration count is tiny, so the fresh-DB approach would be strictly better. It only gets worse as the project grows.

A middle path: fork creates an empty DB, runs migrations, then seeds from a fixture file. Realistic-enough data without coupling to main's live state.

### 4. If we redesigned from scratch today?

**Keep hash-based filenames.** Genuinely good for parallel-agent workflows. Make filenames content-addressed so parallel branches never collide.

**Fresh-DB fork (see #3).** The current fork model is the source of most subtle bugs (the bootstrap branch, the drizzle leftover, the drift semantics). Empty DB + run-all-migrations has fewer moving parts. Seed data separately, as a distinct concern.

**Use an off-the-shelf tool if one fits.** Drizzle's sequential naming didn't fit our parallel model, which is why we rolled our own. Tools like [`sqitch`](https://sqitch.org/), [`dbmate`](https://github.com/amacneil/dbmate), or [Atlas](https://atlasgo.io/) support content-addressed migrations and hash-based bookkeeping natively. Rolling our own was the right call given time pressure, but a mature tool gives us things we don't have yet: down-migrations, dry-runs, diff-based schema changes, transaction-per-migration enforcement, lock-based concurrency safety. Worth revisiting if the migration system becomes a source of pain.

**Separate schema migrations from data migrations.** Right now both go through the same `.sql` mechanism. Schema migrations (DDL) are almost always idempotent with the right syntax. Data migrations (DML — seeds, backfills) are almost never idempotent and fail when run against forked data. Splitting them gives different runtime semantics: DDL can re-run safely; DML must run exactly once against exactly one DB. Avoids a whole class of "I forked and now my seed ran twice" bugs.

**Declarative schema instead of imperative migrations.** The state-of-the-art direction: you write the *desired* schema (`CREATE TABLE users (…)`), a tool diffs it against the live DB, and generates the right `ALTER` statements. Atlas, Prisma Migrate, and a few others do this. You never hand-write `ALTER`. Tradeoff is complexity — the tool has to be smart about destructive changes, data preservation, renames vs. drop+add — and opinionation. For a greenfield project with an AI agent as the primary contributor, declarative might actually fit well: the agent edits the declarative schema, the tool figures out the migration. Zero merge conflicts in the migrations folder by construction. Worth prototyping before migration count grows.

**Schema-per-worktree inside one DB, instead of DB-per-worktree.** Postgres schemas are cheaper than databases (no separate connections, no separate catalogs, cross-schema queries work). The current DB-per-worktree model makes fork the expensive primitive. Schema-per-worktree would make it trivially cheap and still give namespace isolation. Downside is that schema-level isolation is weaker than DB-level — a bug could accidentally write to the wrong schema. Worth considering if fork time becomes a bottleneck.

**None of these are urgent.** The current system is fine for the project's size. But if friction shows up, those are the directions to look.
