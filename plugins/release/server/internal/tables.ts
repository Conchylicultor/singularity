import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { parsedText } from "@plugins/database/plugins/sql-column/server";
import { MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/core";
// Straight to the file, not through `../../core`: drizzle-kit's schema loader
// evaluates this module on its own to read the DDL, and the core barrel also
// carries the endpoint and resource descriptors it has no business pulling in.
import {
  ReleaseRunKindSchema,
  ReleaseRunStatusSchema,
} from "../../core/resources";

export const _releaseRuns = pgTable(
  "release_runs",
  {
    id: text("id").primaryKey(), // `release-${ms}-${rand}`
    composition: text("composition").notNull(),
    target: text("target").notNull(),
    // Namespace (worktree slug, or MAIN_WORKTREE_NAME on main) that produced this
    // run. A worktree DB forks main and inherits main's rows; tagging the
    // producing namespace lets the history resource and orphan sweep scope to
    // their own runs so inherited rows don't surface as phantom state.
    namespace: text("namespace").notNull().default(MAIN_WORKTREE_NAME),
    // Why this run was cut: `candidate` (packed, built for a named platform —
    // shippable) vs `staged` (a `--dev` run, previewable only, claiming no
    // `latest-<platform>` pointer). Stamped from the request's `ReleaseIntent`
    // at claim time. NOT NULL with a `staged` default so every row that existed
    // before candidates reads as what it actually was, and no consumer has to
    // handle a null third state.
    kind: parsedText("kind", ReleaseRunKindSchema).notNull().default("staged"),
    status: parsedText("status", ReleaseRunStatusSchema)
      .notNull()
      .default("running"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    exitCode: integer("exit_code"),
    platform: text("platform"),
    artifactPath: text("artifact_path"), // staged --out dir (from RELEASE.json)
    port: integer("port"), // baked release port (RELEASE.json.port)
    // Provenance, copied off RELEASE.json at completion. `git rev-parse HEAD` of
    // the source tree read BEFORE the artifact phase, and whether that tree was
    // dirty (`git status --porcelain`, untracked included — vite builds
    // untracked files into the dist). Nullable: runs that fail before writing a
    // manifest, and rows inherited from before provenance existed, have neither.
    // A dirty run's sha names its PARENT commit, not its bytes — which is why
    // `compareToHead` reports dirty as `unknown` and never as `current`.
    commitSha: text("commit_sha"),
    commitDirty: boolean("commit_dirty"),
    error: text("error"),
    // OS pid of the detached `./singularity release` process that owns this run.
    // It outlives backend restarts, so its liveness — not an in-process flag — is
    // the source of truth for whether the release is still running. Used by the
    // durable lock and the orphan reconciler. Internal only; stripped from the
    // ReleaseRun resource payload.
    pid: integer("pid"),
  },
  (t) => [
    // At most one in-flight release per (namespace, composition), enforced
    // atomically by the DB. Unlike build (one in-flight per namespace),
    // concurrent releases of DIFFERENT compositions are legitimate — only a
    // duplicate in-flight release of the SAME composition is blocked. The
    // claiming INSERT itself is the lock: the loser fails with 23505 and bails.
    uniqueIndex("release_runs_inflight_uniq")
      .on(t.namespace, t.composition)
      .where(sql`${t.finishedAt} IS NULL`),
    // Supports the composition-scoped keyset seek (queryReleaseHistory): the
    // history DataView pages a single composition's runs newest-first, so this
    // covers the `WHERE namespace = ? AND composition = ? ORDER BY started_at DESC`
    // prefix + tiebreak.
    index("release_runs_ns_comp_started_idx").on(
      t.namespace,
      t.composition,
      t.startedAt.desc(),
    ),
    // Supports the unified runs view's release arm, on every page of every
    // scroll. The arm carries an always-on `where namespace = ?`
    // (runs-arm/server), so its subselect is unconditionally
    // `WHERE namespace = ? ORDER BY started_at DESC, id ASC LIMIT n`.
    //
    // The `(namespace, composition, started_at desc)` index above CANNOT serve
    // it, and that is not obvious: `composition` sits between the constrained
    // leading column and the ordering column, so the walk breaks in the middle.
    // The two indexes answer different questions — that one covers
    // queryReleaseHistory's composition-scoped page, this one the unscoped-by-
    // composition merged list. Neither subsumes the other; do not consolidate.
    //
    // `id` is the keyset tiebreak and part of the ordering, not padding — see
    // the twin index on build_runs for the full argument, including why there is
    // no unscoped `(started_at desc, id)` here either and what would bring it
    // back (making the arm's hard namespace scope widenable).
    index("release_runs_ns_started_id_idx").on(
      t.namespace,
      t.startedAt.desc(),
      t.id,
    ),
  ],
);
