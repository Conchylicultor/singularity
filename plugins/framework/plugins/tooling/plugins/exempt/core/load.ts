import { exemptEntries } from "./exempt.generated";
import { manifestPathOf, resolveManifest } from "./resolve";
import type { ResolvedExemption } from "./types";

/** Repo-relative path of the generated manifest registry. */
export const EXEMPT_REGISTRY_PATH =
  "plugins/framework/plugins/tooling/plugins/exempt/core/exempt.generated.ts";

/**
 * Every file whose content the loaded exemption set is a function of: the
 * generated registry (which manifests exist) and each manifest it lists. A
 * consumer whose verdict is cached on what it read (an input-keyed check, the
 * type-check closure fingerprint) reads or fingerprints exactly these, so a
 * manifest edit invalidates it.
 */
export function exemptionInputPaths(): string[] {
  return [
    EXEMPT_REGISTRY_PATH,
    ...exemptEntries.map((e) => manifestPathOf(e.pluginPath)),
  ];
}

/**
 * Load every `exempt/index.ts` the registry lists, validate it and resolve its
 * paths. Fails loudly, collecting every broken manifest into one error: a
 * manifest that did not load is indistinguishable from one exempting nothing,
 * and that is exactly how a rule would start firing — or a debt entry vanish
 * from the burndown — for no visible reason.
 *
 * Rule ids are checked only for shape here; whether each names a live,
 * non-closed rule is answered where the live rule set is known (the lint
 * config build, the check runner, `exempt:manifests-valid`).
 */
export async function loadExemptions(): Promise<ResolvedExemption[]> {
  const settled = await Promise.allSettled(
    exemptEntries.map((e) => e.loader()),
  );
  const out: ResolvedExemption[] = [];
  const failures: string[] = [];
  for (const [i, r] of settled.entries()) {
    const { pluginPath } = exemptEntries[i]!;
    if (r.status === "rejected") {
      failures.push(
        `${manifestPathOf(pluginPath)}: failed to load — ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
      );
      continue;
    }
    try {
      out.push(...resolveManifest(pluginPath, r.value.default));
    } catch (err) {
      if (!(err instanceof Error)) throw err;
      failures.push(err.message);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `[exempt] ${failures.length} exemption manifest(s) failed:\n${failures.join("\n")}`,
    );
  }
  return out;
}

/** Whether `rule` is spelled as a lint rule id (`<ns>/<rule>`). Check ids never contain `/`. */
export function isLintRuleId(rule: string): boolean {
  return rule.includes("/");
}

/**
 * The problems with exemptions' rule ids against a live rule set: an id no
 * live rule declares, or one whose owner declared it `closed`. One function,
 * so the lint config build, the check runner and `exempt:manifests-valid`
 * cannot disagree about what a bad id is.
 */
export function ruleIdProblems(
  exemptions: readonly ResolvedExemption[],
  live: { known: ReadonlySet<string>; closed: ReadonlySet<string> },
): string[] {
  const problems: string[] = [];
  for (const e of exemptions) {
    if (live.closed.has(e.rule)) {
      problems.push(
        `${e.manifest} exempts "${e.path}" from ${e.rule}, which its owner declares closed — it admits no exemptions`,
      );
    } else if (!live.known.has(e.rule)) {
      problems.push(
        `${e.manifest} exempts "${e.path}" from ${e.rule}, which no lint rule or check declares exemptable`,
      );
    }
  }
  return problems;
}
