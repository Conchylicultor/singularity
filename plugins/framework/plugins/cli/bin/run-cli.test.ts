import { afterEach, expect, spyOn, test } from "bun:test";
import { Command } from "commander";
import { runCli } from "./run-cli";

// Regression guard: a Commander async action that rejects must translate into a
// non-zero exit code at the process boundary, or callers keying on $? read a
// failed build/push/check as success.

// process.exitCode is global state — capture and restore it around each test,
// and silence the loud error print so a thrown-action test doesn't pollute
// output.
const originalExitCode = process.exitCode;
let errorSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
  process.exitCode = originalExitCode;
  errorSpy?.mockRestore();
  errorSpy = undefined;
});

test("async action that throws → exitCode 1", async () => {
  errorSpy = spyOn(console, "error").mockImplementation(() => {});
  const cmd = new Command();
  cmd
    .command("boom")
    .action(async () => {
      throw new Error("boom");
    });

  await runCli(cmd, ["node", "cli", "boom"]);

  expect(process.exitCode).toBe(1);
  expect(errorSpy).toHaveBeenCalled();
});

test("async action that succeeds → exit code not forced to 1", async () => {
  const cmd = new Command();
  cmd.command("ok").action(async () => {
    // resolves cleanly
  });

  process.exitCode = 0;
  await runCli(cmd, ["node", "cli", "ok"]);

  expect(process.exitCode).toBe(0);
});
