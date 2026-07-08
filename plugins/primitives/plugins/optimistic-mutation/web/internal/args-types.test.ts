/**
 * Compile-only negative type guard for `useOptimisticResource`'s args.
 *
 * The paired-field invariant (`isConfirmedBy` present ⟺ `sameTarget` present) is
 * encoded as a discriminated union on `UseOptimisticResourceArgs`. This file
 * asserts — at the type level, validated by the `type-check` tsconfig `test`
 * target — that each half of the pair alone is REJECTED. If either constraint
 * regresses, the corresponding `@ts-expect-error` becomes unused and tsc fails
 * on the now-dead directive — the guard.
 *
 * Everything here is erased at runtime: the sole import is `import type`, the
 * stubs are `declare const`, and the assertions live in a never-invoked
 * function. `bun test` imports this module with zero side effects (and no
 * runtime assertions), so it neither pulls the React/live-state module graph
 * nor executes any hook. Each assignment is a single line, so any type error
 * within it lands on that exact line, right under its directive.
 */

import type { UseOptimisticResourceArgs } from "./use-optimistic-resource";

type Row = { id: string };
type Vars = { id: string };

type Args = UseOptimisticResourceArgs<Row[], Vars>;

declare const resource: Args["resource"];
declare const apply: (current: Row[], vars: Vars) => Row[];
declare const mutate: (vars: Vars) => Promise<void>;
declare const isConfirmedBy: (serverData: Row[], vars: Vars) => boolean;
declare const sameTarget: (a: Vars, b: Vars) => boolean;

export function _optimisticConfirmationArgsGuard(): void {
  // Content-based arm: BOTH fields together type-check.
  const ok1: Args = { resource, apply, mutate, isConfirmedBy, sameTarget };
  // Coarse arm: NEITHER field type-checks.
  const ok2: Args = { resource, apply, mutate };
  // @ts-expect-error — isConfirmedBy requires sameTarget (unrepresentable alone)
  const bad1: Args = { resource, apply, mutate, isConfirmedBy };
  // @ts-expect-error — sameTarget requires isConfirmedBy (unrepresentable alone)
  const bad2: Args = { resource, apply, mutate, sameTarget };
  void ok1;
  void ok2;
  void bad1;
  void bad2;
}
