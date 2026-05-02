import { GUARDS } from "./index";
import { createContext } from "./context";
import type { Guard, ToolMatcher } from "./types";

export interface HookInput {
  tool_name?: string;
  tool_input?: unknown;
  cwd?: string;
}

function matches(g: Guard["matcher"], tool: string): boolean {
  return Array.isArray(g) ? g.includes(tool as ToolMatcher) : g === tool;
}

export async function runHook(input: HookInput): Promise<void> {
  const tool = input.tool_name;
  if (!tool) return;
  const cwd = input.cwd || process.cwd();
  const ctx = createContext(cwd);
  const guards = GUARDS.filter((g) => matches(g.matcher, tool));
  for (const guard of guards) {
    const verdict = await guard.check((input.tool_input ?? {}) as never, ctx);
    if (verdict.kind === "deny") {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: verdict.reason,
          },
        }),
      );
      return;
    }
  }
}
