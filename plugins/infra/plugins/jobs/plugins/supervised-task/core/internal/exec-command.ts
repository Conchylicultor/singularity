/**
 * The `./singularity` verb that runs one registered supervised task.
 *
 * Spelled once because two files have to agree on it and they sit in different
 * runtimes: `cli/index.ts` declares the command under this name, and
 * `server/internal/registry.ts` builds the child argv that invokes it. A second
 * spelling would spawn a child that `./singularity` answers with "unknown
 * command" — a run that fails in the child for a reason nothing in the parent
 * could explain.
 */
export const SUPERVISED_EXEC_COMMAND = "supervised-exec";

/**
 * One child invocation of a registered task: the command to spawn, and the
 * task it stands for.
 *
 * **Minted only by `SupervisedTask.invoke(payload)`** — there is no other
 * producer, and that is what makes `defineSupervisedJob`'s `task` arm mean
 * something the `argv` arm does not. An argv is any command line; this is a
 * command line that provably names a task the registry can resolve, with a
 * payload its own schema accepted.
 *
 * Structurally a `SupervisedJobSpawn` (plus `taskId`), so the wrapper spawns it
 * through exactly the same path as a hand-written argv. Nothing about detach,
 * transcript, marker, reconcile or resume differs for a task.
 */
export interface SupervisedTaskInvocation {
  /** The registered task this invocation runs. Carried for diagnostics. */
  readonly taskId: string;
  /** `./singularity supervised-exec <taskId> <payloadJson>`. */
  readonly argv: readonly string[];
  /** The checkout root, so `./singularity` resolves. */
  readonly cwd: string;
}
