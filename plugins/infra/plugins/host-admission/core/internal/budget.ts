import { cpus, totalmem } from "node:os";

// Runtime-agnostic host-admission arithmetic — pure `node:os` reads, NO `bun:ffi`
// — so the server pools, the budget check, and (later) the CLI all share ONE
// definition of the ceiling and the residual CPU budget.

/**
 * Which half of the host a holder belongs to. Interactive work has a human
 * blocked on it; background work does not. Admission partitions a laned pool's
 * capacity along this axis (the reserved floor). Only the CPU pool is laned
 * today; the wiring lands in a later step.
 */
export type Lane = "interactive" | "background";

/** What ONE admitted holder costs the host, including everything it fans out into. */
export interface PoolCost {
  /** CPU units (1 unit ≈ one saturated core / one type-check-class worker). */
  cpu: number;
  /** Optional RAM cost per holder, for pools whose bind is memory not CPU. */
  ramBytes?: number;
}

/** One type-check-class worker's resident set — the RAM quantum for `B`. */
export const PER_UNIT_BYTES = 2.7e9;

/** Host CPU ceiling: one admission unit per logical core. */
export function hostCpuCeiling(): number {
  return cpus().length;
}

/** Host RAM ceiling for admission: half of physical memory. */
export function hostRamCeiling(): number {
  return totalmem() * 0.5;
}

/** One reserved (non-CPU) pool's admission footprint. */
export interface ReservedPoolSpec {
  /** Number of host-wide slots (flock files) — a pure function of host facts. */
  size: number;
  cost: PoolCost;
}

/**
 * The reserved (non-CPU) host pools, declared ONCE here so the budget check and
 * the CPU pool read the *same* numbers. Each pool's CPU contribution is
 * `size × cost.cpu`; their sum (`reservedCpuCost`) is the CPU the residual `B`
 * must leave for them. Sizes are pure functions of stable host facts (never
 * env-overridable — the size names the flock slot-file set, so it must be
 * identical in every backend), matching the formulas the pools themselves size
 * to.
 *
 * `layout-geometry` and `push` are declared here for the budget even though
 * their `defineHostPool` wiring lands in later steps — their CPU cost is part of
 * the reserved sum today (`layout-geometry`'s 1.0 is why `B` is 11 and not 12).
 */
export const RESERVED_POOLS = {
  "heavy-read": { size: Math.max(1, Math.floor(hostCpuCeiling() / 4)), cost: { cpu: 0.5 } },
  "worktree-mutate": { size: Math.max(2, Math.floor(hostCpuCeiling() / 6)), cost: { cpu: 0.5 } },
  "db-fork": { size: 2, cost: { cpu: 1 } },
  "layout-geometry": { size: 1, cost: { cpu: 1 } },
  "push": { size: 1, cost: { cpu: 0 } },
} as const satisfies Record<string, ReservedPoolSpec>;

/** Total CPU the reserved pools claim: `Σ size × cost.cpu`. */
export function reservedCpuCost(): number {
  return Object.values(RESERVED_POOLS).reduce((sum, p) => sum + p.size * p.cost.cpu, 0);
}

/**
 * The CPU pool's residual budget BEFORE the `≥ 1` floor. This is the budget
 * check's overcommit signal: a value `< 1` means the reserved pools have eaten
 * the whole ceiling and the CPU pool has no room. Bounded by both the CPU
 * residual (`ceiling − reserved`) and the RAM quantum (`ramCeiling / unit`).
 */
export function rawCpuResidual(): number {
  return Math.min(
    Math.floor(hostCpuCeiling() - reservedCpuCost()),
    Math.floor(hostRamCeiling() / PER_UNIT_BYTES),
  );
}

/** The CPU pool's derived size and its interactive/background lane split. */
export interface CpuBudget {
  /** CPU pool size — the residual, floored to `≥ 1` so a holder always gets a slot. */
  B: number;
  /** Reserved interactive floor — high slots background work can never take. */
  reservedInteractive: number;
  /** Background lane window: `B − reservedInteractive`. */
  backgroundLimit: number;
}

/**
 * The CPU pool size `B` is the *residual* of the summed budget, not an
 * independent formula: `B = max(1, min(floor(ceiling − reserved), floor(ram /
 * unit)))`. The reserved interactive floor is `max(1, floor(B / 3))`; the
 * background lane gets the rest.
 */
export function cpuBudget(): CpuBudget {
  const B = Math.max(1, rawCpuResidual());
  const reservedInteractive = Math.max(1, Math.floor(B / 3));
  const backgroundLimit = B - reservedInteractive;
  return { B, reservedInteractive, backgroundLimit };
}
