import { z } from "zod";
import type {
  OpKind,
  WaitKind,
} from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import type { Lane } from "@plugins/infra/plugins/host-admission/core";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

/**
 * A `z.enum` over the canonical union `T`, proving at compile time that the wire
 * enum lists EVERY member of `T` and nothing else.
 *
 * The mapped-type argument does both directions: a member added to `OpKind` /
 * `WaitKind` in op-log's `core` and not listed here is a missing-property error,
 * and a member listed here that the union dropped is an excess-property error.
 * Hand-writing the string union a second time is exactly how the three copies of
 * `PushContentionRecord` drifted; the enums are derived instead.
 */
const exhaustiveEnum = <T extends string>(members: { [K in T]: K }) =>
  z.enum(Object.keys(members) as [T, ...T[]]);

const WaitKindSchema = exhaustiveEnum<WaitKind>({
  "push-mutex": "push-mutex",
  "build-lock": "build-lock",
  "host-grant": "host-grant",
  "duress-valve": "duress-valve",
});

const OpKindSchema = exhaustiveEnum<OpKind>({
  build: "build",
  push: "push",
  check: "check",
});

const LaneSchema = exhaustiveEnum<Lane>({
  interactive: "interactive",
  background: "background",
});

const OpWaitSchema = z.object({
  kind: WaitKindSchema,
  /**
   * Offset from the op's OWN start (i.e. from `OpEntry.startMs`), NOT from the
   * previous wait: an op's waits are interleaved with real work, so they are
   * painted at their true offsets inside the op's span, never packed
   * head-to-tail.
   */
  startMs: z.number(),
  durationMs: z.number(),
});

const OpStepSchema = z.object({
  name: z.string(),
  startMs: z.number(),
  durationMs: z.number(),
});
export type OpStepWire = z.infer<typeof OpStepSchema>;

/**
 * One op on the Gantt — a `build`, a `push`, or a `check`.
 *
 * THE RENDER MODEL: an op is **one bar** spanning `startMs → startMs + totalMs`,
 * colored by `kind`, with each entry of `waits[]` painted as an overlay segment
 * at its own true offset *inside* that span.
 *
 * This is deliberately NOT the old `[wait][hold]` head-to-tail split. Waits
 * interleave with real work, so a build reads as
 * `[build-lock][…migrations/codegen…][duress-valve][host-grant][…heavy work…]`,
 * and a single op may carry several waits of the SAME kind (a build re-queues
 * for the host grant across requeue cycles). A renderer must handle N segments
 * at arbitrary offsets, and must not assume they tile the bar.
 *
 * `totalMs` is the op's FULL span, `requestedAt → completedAt`. The only sound
 * decomposition of it is `totalMs - sum(waits)` = time spent NOT blocked; that
 * holds for every kind, because the waits are disjoint intervals inside the span.
 *
 * `holdMs` is `completedAt - grantedAt` and does NOT decompose against the waits,
 * because where `granted` falls differs per kind (see `markGranted()` in op-log's
 * core — it means "stopped queuing for its ENTRY ticket", not "will never block
 * again"):
 *
 *   check — its host-grant wait is PRE-granted ⇒ `waitMs + holdMs ≈ totalMs`
 *   build — its waits are POST-granted (it grants at the build lock, ~1ms in)
 *           ⇒ they sit INSIDE `holdMs`, so `waitMs + holdMs` far EXCEEDS `totalMs`
 *   push  — mixed: push-mutex pre-granted, the nested checks' host-grant after
 *
 * So never present `holdMs` as "work", and never assume a fixed relation between
 * it and `waitMs`. Use `totalMs - sum(waits)`.
 */
const OpEntrySchema = z.object({
  opId: z.string(),
  kind: OpKindSchema,
  /** Offset from the Gantt origin (`requestedAt - originMs`). */
  startMs: z.number(),
  /** The op's FULL span: waits + work gaps + hold. */
  totalMs: z.number(),
  waits: z.array(OpWaitSchema),
  holdMs: z.number(),
  /** Terminal outcome, or the synthetic `"waiting"` / `"running"` of a live op. */
  outcome: z.string(),
  interrupted: z.boolean(),
  branch: z.string(),
  /** `build` only — the join key that opens the per-run span breakdown. */
  buildId: z.string().nullable(),
  conversationId: z.string().nullable(),
  /** Which reserved-floor lane the op drew from — explains WHY it waited. */
  lane: LaneSchema.nullable(),
});
export type OpEntry = z.infer<typeof OpEntrySchema>;

const WorktreeGroupSchema = z.object({
  worktree: z.string(),
  // The conversation that drove this worktree's work — the first event's
  // conversationId — and its human title, resolved from the main DB. Null when
  // no event carried a conversationId (e.g. build-only rows) or the title is
  // unset. The bar label falls back to the bare worktree id when title is null.
  conversationId: z.string().nullable(),
  title: z.string().nullable(),
  ops: z.array(OpEntrySchema),
});
export type WorktreeGroup = z.infer<typeof WorktreeGroupSchema>;

export const getOpProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/ops",
  query: z.object({
    since: z.coerce.number().optional(),
    worktree: z.string().optional(),
    padding: z.coerce.number().optional(),
  }),
  response: z.object({
    groups: z.array(WorktreeGroupSchema),
    totalMs: z.number(),
  }),
});

/**
 * The full `OpRecord` for one op — every wait, every step, the lane and the raw
 * timestamps. The bar carries only what a glance needs; the fine grain lives
 * here, in the detail pane.
 */
export const OpDetailSchema = z.object({
  opId: z.string(),
  kind: OpKindSchema,
  opSlug: z.string().nullable(),
  worktree: z.string().nullable(),
  branch: z.string(),
  conversationId: z.string().nullable(),
  lane: LaneSchema.nullable(),
  /** `push` only. */
  mode: z.enum(["worktree", "from-main"]).nullable(),
  /** `build` only. */
  buildId: z.string().nullable(),
  requestedAt: z.string(),
  grantedAt: z.string(),
  completedAt: z.string().nullable(),
  waits: z.array(OpWaitSchema),
  /** DERIVED: `sum(waits.durationMs)`. */
  waitMs: z.number(),
  holdMs: z.number(),
  totalMs: z.number(),
  outcome: z.string(),
  interrupted: z.boolean(),
  steps: z.array(OpStepSchema),
});
export type OpDetail = z.infer<typeof OpDetailSchema>;

export const getOpDetail = defineEndpoint({
  route: "GET /api/debug/profiling/ops/:opId",
  response: OpDetailSchema,
});
