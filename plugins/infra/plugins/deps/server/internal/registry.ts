import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { Dep, DepSource } from "./dep";

/**
 * The set of declared dependencies: each declaring plugin lists
 * `DepDeclare({ dep })` in its server `contributions`. The Dependencies view,
 * the `deps` CLI, the install job and the sweep read only this generic set —
 * none of them names a dependency.
 */
export const DepDeclare = defineServerContribution<{ dep: Dep<DepSource> }>(
  "dep",
  { docLabel: (c) => c.dep.id },
);

/** Every declared dependency, in declaration order. */
export function declaredDeps(): Dep<DepSource>[] {
  return DepDeclare.getContributions().map((c) => c.dep);
}

/** The declared dependency with this id; throws naming the known ids. */
export function declaredDep(id: string): Dep<DepSource> {
  const deps = declaredDeps();
  const dep = deps.find((d) => d.id === id);
  if (dep === undefined) {
    throw new UnknownDepError(
      id,
      deps.map((d) => d.id),
    );
  }
  return dep;
}

export class UnknownDepError extends Error {
  constructor(
    readonly id: string,
    readonly known: readonly string[],
  ) {
    super(
      `No dependency is declared with id ${JSON.stringify(id)}. ` +
        (known.length === 0
          ? "None is declared in this composition."
          : `Declared: ${known.join(", ")}.`),
    );
  }
}
