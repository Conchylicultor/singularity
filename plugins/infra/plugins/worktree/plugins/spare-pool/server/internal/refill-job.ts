import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { defineWarmup } from "@plugins/infra/plugins/warmup/server";
import {
  countReadySpares,
  createSpareWorktree,
  pruneSpares,
} from "@plugins/infra/plugins/worktree/server";

/**
 * How many ready spares the pool keeps. One covers the common case (one launch
 * at a time); concurrent launches beyond it fall back to the cold
 * `git worktree add` (~5 s with parallel checkout), and each launch enqueues a
 * refill afterwards.
 */
const SPARE_TARGET = 1;

/**
 * Tops the spare pool back up: reclaims spare debris (a refill or claim killed
 * mid-way) and over-age spares, then writes spares until `SPARE_TARGET` are
 * ready. Enqueued after every launch's checkout, at main's boot, and daily.
 */
export const spareRefillJob = defineJob({
  name: "worktree.spare-refill",
  description:
    "Keeps a ready checkout of main on standby, so launching an agent claims it instead of writing a fresh checkout while you wait.",
  // minutes: one spare is a full `git worktree add` (~5–10 s of 16k file
  // writes), gated host-wide and demoted to background priority.
  hold: "minutes",
  inProcess:
    "Idempotent top-up: a refill killed mid-add leaves an unlocked spare the next run's prune reclaims, and the lock that marks a spare ready is its last step, so nothing half-written is ever claimed.",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  // Daily: replaces a spare older than a day, so the one a claim takes is never
  // weeks behind `main`.
  schedule: { cron: "40 4 * * *" },
  run: async ({ ctx: { signal } }) => {
    await pruneSpares(signal);
    while ((await countReadySpares(signal)) < SPARE_TARGET) {
      await createSpareWorktree(signal);
    }
  },
});

/** Fills the pool at main's boot, so the first launch after a restart claims a spare. */
export const spareRefillWarmup = defineWarmup({
  name: "worktree.spare-refill",
  description:
    "Queues a spare checkout of main at startup, so the first agent launched after a restart starts without waiting for a checkout.",
  scope: "host",
  run: async () => {
    await spareRefillJob.enqueue({});
  },
});
