export type AllowVerdict = { kind: "allow" };
export type DenyVerdict = { kind: "deny"; reason: string; fatal?: boolean };
export type Verdict = AllowVerdict | DenyVerdict;

export type ToolMatcher = "Bash" | "Write" | "Edit" | "Read" | "NotebookEdit" | "Agent";

export interface GuardContext {
  cwd: string;
  hasBypass(token: string): boolean;
  allow(): AllowVerdict;
  deny(reason: string): DenyVerdict;
  fatal(reason: string): DenyVerdict;
}

export interface BashInput { command?: string }
export interface FileInput { file_path?: string }
export interface AgentInput { model?: string; subagent_type?: string }

export interface Guard<I = unknown> {
  name: string;
  matcher: ToolMatcher | ToolMatcher[];
  check(input: I, ctx: GuardContext): Verdict | Promise<Verdict>;
}

export interface FileHint {
  name: string;
  match(filePath: string): boolean;
  message: string;
}
