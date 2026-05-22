import { resolve } from "node:path";
import { GUARDS } from "./index";
import { HINTS } from "./hints";
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

const FILE_TOOLS = new Set(["Write", "Edit", "NotebookEdit", "Read"]);

function collectHints(tool: string, toolInput: Record<string, unknown>, cwd: string): string[] {
  if (!FILE_TOOLS.has(tool)) return [];
  let filePath = toolInput.file_path as string | undefined;
  if (!filePath) return [];
  if (!filePath.startsWith("/")) filePath = resolve(cwd, filePath);
  return HINTS.filter((h) => h.match(filePath!)).map((h) => h.message);
}

export async function runHook(input: HookInput): Promise<void> {
  const tool = input.tool_name;
  if (!tool) return;
  const cwd = input.cwd || process.cwd();
  const ctx = createContext(cwd);
  const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;

  const guards = GUARDS.filter((g) => matches(g.matcher, tool));
  for (const guard of guards) {
    const verdict = await guard.check(toolInput as never, ctx);
    if (verdict.kind === "deny") {
      process.stdout.write(
        JSON.stringify({
          ...(verdict.fatal ? { continue: false, stopReason: verdict.reason } : {}),
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

  const hints = collectHints(tool, toolInput, cwd);
  if (hints.length > 0) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: hints.join("\n\n"),
        },
      }),
    );
  }
}
