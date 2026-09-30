import { mintExecContext, type ExecContext } from "../internal/exec-context";

/** An `ExecContext` for tests: origin `cli`, admission that admits at once. */
export function execContextForTests(): ExecContext {
  return mintExecContext("cli", (fn) => fn());
}
