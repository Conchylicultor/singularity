import type { Command } from "commander";

/**
 * Process-boundary harness for the CLI. Commander's async actions reject
 * instead of exiting non-zero, so a thrown action must be translated into a
 * non-zero exit here — otherwise callers keying on the exit code read a failed
 * build/push/check as success. Fails loudly: prints the error and sets a
 * non-zero exit code.
 */
export async function runCli(program: Command, argv?: readonly string[]): Promise<void> {
  try {
    await program.parseAsync(argv as string[]);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
}
