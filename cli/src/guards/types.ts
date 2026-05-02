export type Verdict = { kind: "allow" } | { kind: "deny"; reason: string };

export type ToolMatcher = "Bash" | "Write" | "Edit" | "NotebookEdit" | "Agent";

export interface GuardContext {
  cwd: string;
  hasBypass(token: string): boolean;
  allow(): Verdict;
  deny(reason: string): Verdict;
}

export interface BashInput { command?: string }
export interface FileInput { file_path?: string }
export interface AgentInput { model?: string; subagent_type?: string }

export interface Guard<I = unknown> {
  name: string;
  matcher: ToolMatcher | ToolMatcher[];
  check(input: I, ctx: GuardContext): Verdict | Promise<Verdict>;
}
