import type { Check } from "@plugins/framework/plugins/tooling/core";
import {
  evaluateFirehoseCoverage,
  getFirehoseEntries,
  getRetentionCoveredTables,
} from "../shared/internal/firehose-registry";

const check: Check = {
  id: "retention:firehose-bounded",
  description:
    "Every declared-firehose table (defineRetention({firehose:true}) / markFirehose) must be bounded by a retention policy naming it or a declared cascade owner.",
  // Reads the module-level firehose registry (a runtime side effect of
  // defineRetention/markFirehose), not tree content — never reuse a cached PASS.
  cacheSignature: () => null,
  async run() {
    const result = evaluateFirehoseCoverage(
      getFirehoseEntries(),
      getRetentionCoveredTables(),
    );
    if (result.ok) return { ok: true };
    return {
      ok: false,
      message:
        `${result.uncovered.length} declared-firehose table(s) have no growth bound:\n` +
        result.uncovered.map((t) => `    ${t}`).join("\n"),
      hint: "Give each listed table a growth bound: add `defineRetention({ table, ttlDays, firehose: true })` (a nightly TTL sweep), or — if its rows are reclaimed by an FK onDelete:\"cascade\" to an owner — declare `markFirehose(table, { cascadeOwner: true })` instead.",
    };
  },
};

export default check;
