import { resolve } from "node:path";
import { GUARDS } from "./index";
import { HINTS } from "./hints";
import { createContext } from "./context";
import type { Guard, ToolMatcher } from "./types";

export interface HookInput {
  tool_name?: string;
  tool_input?: unknown;
  cwd?: string;
  /**
   * Claude Code stamps every hook payload with the session it came from. Read it
   * from here rather than from an ambient env var: the payload is the documented
   * contract, and a stateful guard that keys on the wrong identity either leaks
   * state between sessions or loses it within one.
   */
  session_id?: string;
}

function matches(g: Guard["matcher"], tool: string): boolean {
  return Array.isArray(g) ? g.includes(tool as ToolMatcher) : g === tool;
}

const FILE_TOOLS = new Set(["Write", "Edit", "NotebookEdit", "Read"]);

function collectHints(
  tool: string,
  toolInput: Record<string, unknown>,
  cwd: string,
): string[] {
  if (!FILE_TOOLS.has(tool)) return [];
  let filePath = toolInput.file_path as string | undefined;
  if (!filePath) return [];
  if (!filePath.startsWith("/")) filePath = resolve(cwd, filePath);
  return HINTS.filter(
    (h) =>
      (!h.tools || h.tools.includes(tool as ToolMatcher)) && h.match(filePath!),
  ).map((h) => h.message);
}

/**
 * What the entry point must tell the runner, over and above the hook payload.
 *
 * REQUIRED, not defaulted: every field here is a fact `core/` cannot reach on
 * its own, and a default would silently be the wrong answer. A new entry point
 * that forgets `writableDataDirs` would start denying writes to the prototypes
 * tree again — with a `= []` default that regression is invisible, as a
 * required field it is a type error.
 */
export interface HookOptions {
  /** See `GuardContext.writableDataDirs` — resolved, absolute. */
  writableDataDirs: readonly string[];
}

export async function runHook(
  input: HookInput,
  options: HookOptions,
): Promise<void> {
  const tool = input.tool_name;
  if (!tool) return;
  const cwd = input.cwd || process.cwd();
  const ctx = createContext(
    cwd,
    input.session_id || "unknown",
    options.writableDataDirs,
  );
  const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;

  const guards = GUARDS.filter((g) => matches(g.matcher, tool));
  // Facts contributed by guards that let the call through. Collected rather than
  // returned early, so one guard's answer never suppresses another's denial.
  const informs: string[] = [];
  for (const guard of guards) {
    const verdict = await guard.check(toolInput as never, ctx);
    if (verdict.kind === "inform") {
      informs.push(verdict.context);
      continue;
    }
    if (verdict.kind === "deny") {
      process.stdout.write(
        JSON.stringify({
          ...(verdict.fatal
            ? { continue: false, stopReason: verdict.reason }
            : {}),
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

  const extra = [...informs, ...collectHints(tool, toolInput, cwd)];
  if (extra.length > 0) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          additionalContext: extra.join("\n\n"),
        },
      }),
    );
  }
}
