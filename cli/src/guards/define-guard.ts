import type { Guard, GuardContext, ToolMatcher, Verdict } from "./types";

export interface Denial {
  /** Short statement of what was blocked */
  blocked: string;
  /** Why this is dangerous (optional background) */
  why?: string;
  /** What to do instead */
  hint: string;
  /** If true, skip the standard STOP/report epilogue */
  skipEpilogue?: boolean;
}

export interface GuardDef<I> {
  name: string;
  matcher: ToolMatcher | ToolMatcher[];
  /** File token checked via ctx.hasBypass() before check() runs */
  bypassToken?: string;
  check(input: I, ctx: GuardContext): Denial | null;
}

function formatEpilogue(bypassToken?: string): string {
  let epilogue =
    "If you believe this block is a false positive: STOP immediately, report the blocked command and your reasoning to the user, and wait for instructions. Do NOT attempt to work around this guard — not by restructuring the command, not by using alternative tools, not by any other means.";
  if (bypassToken) {
    epilogue += ` If the user explicitly approves, they will tell you to create $PWD/${bypassToken} to bypass.`;
  }
  return epilogue;
}

function formatDenyMessage(denial: Denial, bypassToken?: string): string {
  let msg = denial.blocked;
  if (denial.why) msg += `\n\n${denial.why}`;
  msg += `\n\n${denial.hint}`;
  if (!denial.skipEpilogue) msg += `\n\n${formatEpilogue(bypassToken)}`;
  return msg;
}

export function defineGuard<I>(def: GuardDef<I>): Guard<I> {
  return {
    name: def.name,
    matcher: def.matcher,
    check(input: I, ctx: GuardContext): Verdict | Promise<Verdict> {
      if (def.bypassToken && ctx.hasBypass(def.bypassToken)) return ctx.allow();
      const denial = def.check(input, ctx);
      if (!denial) return ctx.allow();
      return ctx.deny(formatDenyMessage(denial, def.bypassToken));
    },
  };
}
