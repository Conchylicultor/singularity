import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { _deployServers } from "@plugins/apps/plugins/deploy/plugins/servers/server";
// The specific module, not the `core` barrel: drizzle-kit loads this file to
// build the schema, and `core/derive.ts` is plain strings with no imports at all.
import { DEFAULT_LOOPBACK_PORT } from "../../core/derive";

// Where a composition is served and under what URL: `(composition × server) →
// { hostnames, loopbackPort }`. Runtime data, deliberately not repo state — the
// same composition can be served on many surfaces, and a URL is a deploy/server
// concern rather than a property of the software. See `../../core/schemas.ts`
// for what is absent and why (the run user, dir layout, unit and platform are
// all derived, never columns).
export const _deployDeployments = pgTable(
  "deploy_deployments",
  {
    id: text("id").primaryKey(),
    // A composition NAME from the `compositions` config. No FK to point at —
    // compositions are config_v2 data, not rows — so the create handler
    // validates membership at write time.
    compositionId: text("composition_id").notNull(),
    serverId: text("server_id")
      .notNull()
      .references(() => _deployServers.id, { onDelete: "cascade" }),
    // Public hostnames Caddy serves this deployment on. Empty is legal: an
    // install can exist before DNS does. `exposure` is derived from this array
    // being non-empty, never declared — a deployment behind an open 443 with a
    // public hostname simply IS public, so there is no flag to typo.
    hostnames: text("hostnames").array().notNull(),
    loopbackPort: integer("loopback_port")
      .notNull()
      .default(DEFAULT_LOOPBACK_PORT),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // The two invariants are carried by the DB, so neither needs a check and
    // neither can be lost to a concurrent write.
    //
    // One install of a composition per server. This is what buys the
    // single-name property: with no second deployment to disambiguate, the
    // composition name alone can name the install dir, the systemd instance,
    // the runtime namespace and the database. Staging and prod of one
    // composition therefore live on different servers, which is the normal
    // arrangement anyway; a `slot` discriminator is the documented way to lift
    // this if a real need appears.
    uniqueIndex("deploy_deployments_composition_server_uq").on(
      t.compositionId,
      t.serverId,
    ),
    // The port is the only resource two installs on one box contend for.
    uniqueIndex("deploy_deployments_server_port_uq").on(
      t.serverId,
      t.loopbackPort,
    ),
  ],
);

// The deploy ledger: one row per launched run — *what was put on this box, when,
// from which commit, and what happened*. It exists because `deploy.runs` is an
// in-memory Map that a backend restart empties, which left that question
// unanswerable after a reboot; the two are not redundant (see `../../core/runs.ts`:
// the Map is the live view, this is the record).
//
// Written only by `run-state.ts` — `startRun` opens a row, `finishRun` stamps its
// outcome — so there is exactly one writer and the live view and the record can
// never disagree about a run they both name by the same `id`.
export const _deployRuns = pgTable(
  "deploy_runs",
  {
    id: text("id").primaryKey(),
    deploymentId: text("deployment_id")
      .notNull()
      .references(() => _deployDeployments.id, { onDelete: "cascade" }),
    // Copied off the deployment at launch, not joined. Both are create-only on
    // the deployment, so this cannot drift — it is here so a row states which box
    // and which software without a join, and keeps saying so while the query
    // filters by deployment.
    serverId: text("server_id").notNull(),
    compositionId: text("composition_id").notNull(),
    verb: text("verb").notNull(), // converge|ship|update
    // The pinned release run id (`ship --release <id>`). Null where there is
    // genuinely none: a converge, or a bare ship that let the CLI follow
    // `latest-<platform>` inside its own process.
    releaseRunId: text("release_run_id"),
    // The commit the shipped bundle was built from, read off the resolved
    // bundle's manifest. Null where unknown — never HEAD, which is a fact about
    // this checkout rather than about the bytes that went out.
    commitSha: text("commit_sha"),
    status: text("status").notNull().default("running"), // running|succeeded|failed
    // The leg an `update` died on. Null unless the run failed on one — a
    // succeeded run has no failing phase, and a single-verb run has no phases.
    phaseFailed: text("phase_failed"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Null while running — including forever, on a run whose backend died before
    // it could stamp an outcome. That is the honest record of what was observed.
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    exitCode: integer("exit_code"),
    // The CLI's own words on a failure, stored verbatim.
    message: text("message"),
  },
  (t) => [
    // Covers the per-deployment history query's `WHERE deployment_id = ?
    // ORDER BY started_at DESC` keyset seek + tiebreak.
    index("deploy_runs_deployment_started_idx").on(
      t.deploymentId,
      t.startedAt.desc(),
    ),
    // Covers the UNSCOPED read — the unified runs query's per-arm subselect,
    // `ORDER BY started_at DESC, id ASC LIMIT n`, and the nightly retention
    // sweep's range scan on the same column. The index above cannot serve
    // either: both bind no deployment, so its leading column is dead and the
    // ordering degrades to a top-N heapsort over the whole ledger. Both indexes
    // are needed; neither subsumes the other. (No namespace to lead with —
    // a deploy targets a remote server, so this arm carries no worktree
    // predicate, unlike the build and release arms. See the arm's CLAUDE.md.)
    index("deploy_runs_started_id_idx").on(t.startedAt.desc(), t.id),
  ],
);
