import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BashInput, Guard, GuardContext, Verdict } from "../types";

const THRESHOLD = 5;

interface State {
  command: string;
  count: number;
}

function stateFile(): string {
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID ?? "unknown";
  return join(tmpdir(), `guard-repeated-cmd-${sessionId}.json`);
}

function loadState(path: string): State {
  if (!existsSync(path)) return { command: "", count: 0 };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as State;
  } catch {
    return { command: "", count: 0 };
  }
}

export const repeatedCommandGuard: Guard<BashInput> = {
  name: "repeated-command",
  matcher: "Bash",
  check(input: BashInput, ctx: GuardContext): Verdict {
    const cmd = input.command?.trim();
    if (!cmd) return ctx.allow();

    const path = stateFile();
    const state = loadState(path);

    if (cmd === state.command) {
      state.count++;
    } else {
      state.command = cmd;
      state.count = 1;
    }

    writeFileSync(path, JSON.stringify(state));

    if (state.count >= THRESHOLD) {
      return ctx.deny(
        `Blocked: you have run the exact same command ${state.count} times in a row:\n\n` +
          `  ${cmd}\n\n` +
          `This looks like a polling loop. The command is unlikely to produce a different result on the next attempt.\n\n` +
          `STOP immediately. Report to the user what you are waiting for and why, then wait for instructions. ` +
          `Do NOT retry this command or restructure it to work around this guard.`,
      );
    }

    return ctx.allow();
  },
};
