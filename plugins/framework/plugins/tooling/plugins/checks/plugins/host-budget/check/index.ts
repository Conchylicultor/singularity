import {
  hostCpuCeiling,
  reservedCpuCost,
  rawCpuResidual,
  cpuBudget,
  RESERVED_POOLS,
} from "@plugins/infra/plugins/host-admission/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// The convergence property: the summed CPU cost of every declared host pool must
// fit under the host CPU ceiling, and the CPU pool's residual `B` must stay ≥ 1.
// Pools live in server barrels, but their CPU cost is declared as data in
// host-admission/core's `RESERVED_POOLS` (the single source), so this check reads
// the numbers WITHOUT importing any server pool code.
//
// Total demand = Σ(reserved pool size × cpu) + B (the CPU pool's own contribution,
// each of its B units costing 1). `B` is the RESIDUAL of the summed budget, so
// adding a pool that claims more CPU pushes the residual down; once it goes
// non-positive (`rawCpuResidual < 1`) the box is overcommitted — that failure IS
// the property this check asserts.
const check: Check = {
  id: "host-budget",
  description:
    "Summed CPU cost of all declared host pools must fit under hostCpuCeiling(), with the CPU pool residual B ≥ 1",
  async run() {
    const ceiling = hostCpuCeiling();
    const reserved = reservedCpuCost();
    const { B } = cpuBudget();
    const residual = rawCpuResidual();
    const total = reserved + B;

    if (residual < 1) {
      const breakdown = Object.entries(RESERVED_POOLS)
        .map(([id, p]) => `${id}: ${p.size} × ${p.cost.cpu} = ${p.size * p.cost.cpu}`)
        .join("\n    ");
      return {
        ok: false,
        message:
          `host CPU residual B went non-positive (${residual}): the reserved pools claim ` +
          `${reserved} CPU of a ${ceiling}-core ceiling, leaving no room for the CPU pool.\n    ${breakdown}`,
        hint: "Lower a pool's size/cpu cost in host-admission/core's RESERVED_POOLS, or a new pool is overcommitting the host.",
      };
    }

    if (total > ceiling) {
      return {
        ok: false,
        message:
          `summed host-pool CPU cost ${total} (reserved ${reserved} + B ${B}) exceeds the ` +
          `${ceiling}-core ceiling`,
        hint: "Reduce a pool's declared cpu cost or size in host-admission/core's RESERVED_POOLS.",
      };
    }

    return { ok: true };
  },
};

export default check;
