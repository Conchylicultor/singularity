export type AllowVerdict = { kind: "allow" };
export type DenyVerdict = { kind: "deny"; reason: string; fatal?: boolean };
/**
 * Let the call through, but hand the model a fact it was missing. The arm for a
 * guard that has an *answer* rather than an objection — blocking there would be
 * a false positive, and staying silent leaves the model to keep guessing.
 */
export type InformVerdict = { kind: "inform"; context: string };
export type Verdict = AllowVerdict | DenyVerdict | InformVerdict;

export type ToolMatcher =
  "Bash" | "Write" | "Edit" | "Read" | "NotebookEdit" | "Agent";

export interface GuardContext {
  cwd: string;
  /**
   * The Claude Code session this tool call belongs to, straight off the
   * PreToolUse payload. Guards that carry state across calls key it on this.
   */
  sessionId: string;
  hasBypass(token: string): boolean;
  allow(): AllowVerdict;
  deny(reason: string): DenyVerdict;
  fatal(reason: string): DenyVerdict;
  inform(context: string): InformVerdict;
}

export interface BashInput {
  command?: string;
  /**
   * Set by the caller to detach the command. Only a tool-level background run
   * is tracked by the harness and notifies on exit — a shell-level `&` is not.
   */
  run_in_background?: boolean;
}
export interface FileInput {
  file_path?: string;
}
export interface AgentInput {
  model?: string;
  subagent_type?: string;
}

export interface Guard<I = unknown> {
  name: string;
  matcher: ToolMatcher | ToolMatcher[];
  check(input: I, ctx: GuardContext): Verdict | Promise<Verdict>;
}

export interface FileHint {
  name: string;
  match(filePath: string): boolean;
  message: string;
  /** Tools this hint fires on. Omit for every file tool (incl. Read). */
  tools?: ToolMatcher[];
}
