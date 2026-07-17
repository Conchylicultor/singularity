# host-admission

The one place a **host-wide** concurrency pool comes into existence. Every pool
that bounds work across the ~16 worktree backends sharing one box is declared
through `defineHostPool` here, so `createHostSemaphore`
(`packages/host-semaphore`) is imported by **this plugin only** — the
`host-pools-declared` check makes that the structural bar. A 7th pool cannot
appear one incident at a time without taking budget from the others.

## One ceiling, two dimensions (`core`)

`core/` is runtime-agnostic (pure `node:os`, no `bun:ffi`) so the pools, the
budget check, and — later — the CLI share ONE definition:

```
hostCpuCeiling() = os.cpus().length            // 18 on this box
hostRamCeiling() = os.totalmem() * 0.5         // 34.4 GB
PER_UNIT_BYTES   = 2.7e9                        // one type-check-class worker
```

Every pool declares what **one admitted holder costs the host, including
everything it fans out into** (`PoolCost { cpu, ramBytes? }`). The reserved
(non-CPU) pools live in `RESERVED_POOLS` — the single source both the check and
the CPU pool read, so their numbers can never drift:

| pool | size | cpu | Σ cpu |
| --- | --- | --- | --- |
| `heavy-read` | `max(1, cpus/4)` = 4 | 0.5 | 2.0 |
| `worktree-mutate` | `max(2, cpus/6)` = 3 | 0.5 | 1.5 |
| `db-fork` | 2 | 1.0 | 2.0 |
| `layout-geometry` | 1 | 1.0 | 1.0 |
| `push` | 1 | 0 | 0.0 |
| | | **reserved** | **6.5** |

The CPU pool's size `B` is the **residual**, not an independent formula:

```
B = max(1, min(floor(hostCpuCeiling − reservedCpuCost),
               floor(hostRamCeiling / PER_UNIT_BYTES)))
  = min(floor(18 − 6.5), floor(34.4 / 2.7)) = min(11, 12) = 11
reservedInteractive = max(1, floor(B / 3)) = 3
backgroundLimit     = B − reservedInteractive = 8
```

`rawCpuResidual()` is the pre-floor value: `< 1` means the reserved pools have
eaten the whole ceiling — the overcommit signal the `host-budget` check trips on.
`layout-geometry` and `push` are in `RESERVED_POOLS` for the budget even though
their `defineHostPool` wiring lands in later steps (`layout-geometry`'s 1.0 is
why `B` is 11, not 12).

### The RAM dimension is a forward hook, NOT a budget

Only **one** of the two dimensions is actually summed. `host-budget` sums `cpu`;
`PoolCost.ramBytes` is declared, set by exactly one pool (`cpu`), and **read by
nothing**. The only RAM that is accounted enters through `PER_UNIT_BYTES`, as a
ceiling on `B`'s *size* — not as a per-pool budget.

**Do not "finish" this by asserting `Σ(size × ramBytes) ≤ hostRamCeiling()`.** That
assertion is unsound: `B` is *constructed* by the `min()` in `rawCpuResidual()` to
satisfy `B × PER_UNIT_BYTES ≤ hostRamCeiling()`, so it is tautological on its dominant
term and can never fail on its own. The apparent headroom is floor-rounding slack from
whichever term won the `min()`, and spending it on a new pool double-spends the ceiling.

The sound form is **reserved-subtraction** — a `reservedRamCost()` mirroring
`reservedCpuCost()`, carved out *inside* the `min()` term, so a pool that reserves RAM
legitimately pushes `B` down (more concurrent whole-builds ⇒ fewer concurrent heavy
workers). That, plus a whole-build `build` pool, is designed and **gated on measurement**
in [`research/2026-07-12-global-host-admission-memory-dimension.md`](../../../../research/2026-07-12-global-host-admission-memory-dimension.md)
(Stage 2). `PER_UNIT_BYTES` itself is inherited rather than observed — see the warning on
the constant.

## `defineHostPool` (`server`)

`defineHostPool({ id, size, cost, laned? })` wraps `createHostSemaphore` and
returns a `HostPool` (`run` / `acquireShare` / `depth`). It is a **registry**:
one handle per id per process, so a repeat call for the same id — an occupant
contending for the same physical slots — returns the one handle rather than
building a second semaphore or double-registering the gauge. A mismatching spec
throws.

On first definition it **auto-registers** the pool's `<id>-acquire` gate gauge
(same vocabulary as the `chargeWait` layer names) whose `active` is **true
host-wide occupancy** — probed from the flock files across every backend, not
this process's local held count. The ported pools deleted their hand-rolled
`heldByThisProcess` counter and the false "host-wide occupancy is not cheaply
readable" comment along with it.

A `laned` pool MUST also pass an explicit `backgroundLimit` (the `background`
lane's slot window); `defineHostPool` throws otherwise, since silently falling
back to `backgroundLimit === size` would void the reserved floor the flag
promises. Only the `cpu` pool is laned today.

## The grant (`server`)

Admission returns **tokens**, not permission. A build/check/push acquires ONE
host share and subdivides it across everything it fans out into — nothing it
spawns re-acquires host-wide:

```ts
withHostGrant({ lane, max }, (grant) => { … })   // acquire, run, release
inheritedGrant(): Grant | undefined              // the parent's grant, via env
```

`withHostGrant` calls the laned `cpu` pool's `acquireShare(max, { lane })`, wraps
the returned `slots` in an in-process `createSemaphore(slots)`
(`packages/semaphore`), and hands the caller a `Grant`:

- `grant.units` — slots actually held (always `>= 1`, so a 1-unit grant merely
  serializes the holder's children — no starvation branch, no `min > 1` acquire
  that would livelock two builds each holding one slot).
- `grant.run(fn)` — spend one unit through the in-process semaphore. Every heavy
  child (a type-check worker, tsc, vite, the Chromium suite) goes through it.
- `grant.env()` — `{ SINGULARITY_HOST_GRANT, SINGULARITY_LANE }`, inherited by a
  subprocess child so its `inheritedGrant()` rebuilds the SAME budget and spends
  those units — acquiring NOTHING host-wide, because the parent holds the slots
  and the child is their only spender. This is what deletes the old
  `SINGULARITY_HOST_SLOT_HELD` / `kind: "exempt"` double-acquire dodge.

The obligation reaches checks through `CheckContext { grant }`
(`framework/tooling/core`): the check runner passes the invoker's grant to every
`check.run(ctx)`, and the two heavy checks (`type-check`, `layout-geometry`)
spend it per child instead of acquiring again.

## The push mutex (`server`)

`pushPool = defineHostPool({ id: "push", size: 1, cost: { cpu: 0 } })` is the
global push serialization, folded onto the primitive: at most one push runs
host-wide, `cost.cpu 0` because a push waits on git/network (it takes an
interactive CPU grant separately for its nested checks). Its single slot file —
`~/.singularity/push-slots/slot-0.lock` (mirrored as `PUSH_SLOT_PATH`) — is the
SAME file `worktree/server`'s `PUSH_LOCK_PATH` probes, so the op-status
derivation keeps reading the authoritative kernel flock the CLI holds.

## `hostOccupancy()`

`hostOccupancy()` probes every registered pool's slots and reports
`{ id, held, size }` per pool. Probing uses the `pushLockHeld` technique
(`worktree-op.ts`): a non-blocking `flock(LOCK_EX|LOCK_NB)` that releases
immediately, which detects a holder even on a separate fd in the same process
(flock attaches to the open file description, not the process).

Probes run **serially** — across pools and within each pool — because probing a
*free* slot momentarily holds it: a parallel probe of a whole pool could make a
concurrent acquirer's sweep see zero free slots and needlessly fan out. Serial
bounds that transient hold to one slot at a time. Never call it from an acquire
path; it is for the health-monitor tick and a Debug row.

See `research/2026-07-10-global-host-admission-unified-budget.md`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Host-admission registry: one place a host-wide concurrency pool comes into existence, wrapping createHostSemaphore with a summed CPU/RAM ceiling and true host occupancy.
- Server:
  - Uses: `infra/paths.SINGULARITY_DIR`, `packages/host-semaphore.AcquireHooks`, `packages/host-semaphore.createHostSemaphore`, `packages/host-semaphore.HostShare`
  - Exports: Types: `HostPool`, `HostPoolSpec`, `PoolOccupancy`; Values: `cpuPool`, `defineHostPool`, `hostOccupancy`, `inheritedGrant`, `PUSH_SLOT_PATH`, `pushPool`, `withHostGrant`
- Cross-plugin:
  - Imported by: `database/admin`, `debug/profiling/boot-bench`, `infra/host-read-pool`, `infra/worktree`
- Core:
  - Exports: Types: `CpuBudget`, `Grant`, `GrantHooks`, `Lane`, `PoolCost`, `ReservedPoolSpec`; Values: `cpuBudget`, `HOST_GRANT_ENV`, `HOST_LANE_ENV`, `hostCpuCeiling`, `hostRamCeiling`, `PER_UNIT_BYTES`, `rawCpuResidual`, `RESERVED_POOLS`, `reservedCpuCost`

<!-- AUTOGENERATED:END -->
