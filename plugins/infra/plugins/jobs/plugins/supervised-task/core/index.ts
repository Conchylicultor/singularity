// `core/` here is the pair of things BOTH other runtimes of this plugin need:
// the CLI verb's name (declared in `cli/`, spelled into an argv in `server/`)
// and the shape of one child invocation (produced in `server/`, consumed by
// `supervised-job`). Nothing here imports anything, which is what lets a command
// declaration reach it — `cli:command-declarations-light` measures that closure.
export { SUPERVISED_EXEC_COMMAND } from "./internal/exec-command";
export type { SupervisedTaskInvocation } from "./internal/exec-command";
