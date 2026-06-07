import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";

export interface CrashNoiseInput {
  source: string;
  errorType: string | null;
  message: string;
  stack: string | null;
}
export interface CrashNoiseRuleSpec {
  id: string;
  matches: (input: CrashNoiseInput) => boolean;
}

export const CrashNoiseRule = defineServerContribution<CrashNoiseRuleSpec>(
  "crash-noise-rule",
  { docLabel: (r) => r.id },
);

// collectContributions() runs at boot, before any handler — getContributions() is populated
// by the time recordCrash runs (HTTP handler, onReady flush, or error reporter).
export function isNoiseCrash(input: CrashNoiseInput): boolean {
  return CrashNoiseRule.getContributions().some((rule) => {
    try {
      return rule.matches(input);
    } catch {
      return false; // a buggy rule must never break the crash pipeline (itself the error path)
    }
  });
}
