import {
  hostCpuCeiling,
  cpuBudget,
  HOST_POOLS,
} from "@plugins/infra/plugins/host/plugins/host-admission/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

/**
 * How far the total admitted concurrency may exceed the host's core count.
 *
 * **This is a stampede bar, not a model of the box.** It is deliberately not a
 * scheduling claim: admitted holders are mostly NOT CPU-saturating (`heavy-read`
 * and `worktree-mutate` are IO-bound, `push` waits on git and the network), and
 * the box runs far more un-admitted work than admitted work — ~16 backends,
 * agent sessions, editors, one Postgres — so pretending to schedule cores here
 * would be false precision dressed as rigour. What the bar is FOR is catching a
 * pool declared at an implausible size: at 2× the core count today's declarations
 * sit at 22 of 36, and a `size: 50` pool trips it loudly.
 */
const MAX_OVERSUBSCRIPTION = 2;

// The property: the total number of holders host admission can admit at once —
// every pool's cardinality cap, plus the elastic fleet `B` — must stay within a
// small multiple of the host's cores.
//
// This is NOT the old assertion. Until 2026-09-09 each pool declared a CPU cost
// that was subtracted from the ceiling before `B` was taken, and this check
// asserted the residual had not gone non-positive. Nothing reserves any more (see
// `research/2026-09-09-global-host-pools-stop-reserving-cpu.md`): `B` is a pure
// function of host facts, so nothing a pool declares can push it anywhere and
// that failure mode no longer exists. What CAN still go wrong is a pool declared
// at a size nobody sanity-checked — `host-pools-declared` stops a pool being
// created outside `host-admission`, but it says nothing about how big one is.
//
// Sizes live in `HOST_POOLS` (the single source the pools themselves read), so
// this check reads the numbers WITHOUT importing any server pool code.
const check: Check = {
  id: "host-budget",
  description: `Total admitted concurrency (Σ host-pool sizes + the fleet B) must stay within ${MAX_OVERSUBSCRIPTION}× hostCpuCeiling()`,
  async run() {
    const ceiling = hostCpuCeiling();
    const limit = ceiling * MAX_OVERSUBSCRIPTION;
    const pooled = Object.values(HOST_POOLS).reduce(
      (sum, p) => sum + p.size,
      0,
    );
    const { B } = cpuBudget();
    const total = pooled + B;

    if (total > limit) {
      const breakdown = Object.entries(HOST_POOLS)
        .map(([id, p]) => `${id}: ${p.size}`)
        .concat(`cpu (fleet B): ${B}`)
        .join("\n    ");
      return {
        ok: false,
        message:
          `host pools admit up to ${total} concurrent holders (Σ pool sizes ${pooled} + fleet B ${B}), ` +
          `over the ${limit} allowed on a ${ceiling}-core host (${MAX_OVERSUBSCRIPTION}× the core count).\n    ${breakdown}`,
        hint: "Lower a pool's size in host-admission/core's HOST_POOLS — a pool's size is a cardinality cap on a kind of work, so an implausibly large one is a wiring mistake, not a budget decision.",
      };
    }

    return { ok: true };
  },
};

export default check;
