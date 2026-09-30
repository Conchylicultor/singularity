import { withHostGrant } from "@plugins/infra/plugins/host/plugins/host-admission/server";

/**
 * The host admission every `ExecContext` carries: one background unit, so
 * whatever runs under it (a dependency install, a dataset download) yields
 * host CPU to builds and interactive work.
 *
 * One definition for both mints: the supervised run body (`run-body.ts`) and
 * `cliExecContext` (`cli/internal/cli-exec-context.ts`, which reaches this file
 * through a deferred import so the `cli` declaration stays light).
 */
export function admitBackground<T>(fn: () => Promise<T>): Promise<T> {
  return withHostGrant({ lane: "background", max: 1 }, () => fn());
}
