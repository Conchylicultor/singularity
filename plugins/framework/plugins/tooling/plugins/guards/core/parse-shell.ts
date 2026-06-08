import { resolve } from "node:path";

export interface ShellCall {
  name: string;
  args: string[];
  raw: string;
  /**
   * Effective working directory when this call runs, folding every preceding
   * `cd` in the chain over `baseCwd`. Resolve a call's relative path args
   * against THIS — never treat them as literal strings, or `cd <dir> && rm
   * <rel>` slips past. Equals `baseCwd` when no `baseCwd` was supplied.
   */
  cwd: string;
  /** Redirections local to this sub-command (resolve targets against `cwd`). */
  redirections: ShellRedirection[];
}

export interface ShellRedirection {
  op: ">" | ">>";
  target: string;
}

export interface ShellParseResult {
  calls: ShellCall[];
  /** Every redirection across the command, flattened from `calls`. */
  redirections: ShellRedirection[];
}

type Mode = "none" | "single" | "double";

/**
 * Finds the first shell call in a (possibly compound) command that satisfies
 * `predicate`, scanning EVERY call — not just the first invocation of a binary.
 *
 * The predicate MUST encode the full danger condition (the command name AND its
 * offending args together). Never match by name here and re-check the args back
 * at the call site: a benign earlier call (`rg -n …; rg -rn …`, or
 * `find . -maxdepth 1 …; find /huge …`) would mask a dangerous later one because
 * the first name-match short-circuits. Folding the whole condition into a single
 * predicate makes that class of bug structurally impossible — which is why every
 * Bash guard routes call selection through here.
 */
export function findCall(
  cmd: string,
  predicate: (call: ShellCall) => boolean,
): ShellCall | undefined {
  return parseShell(cmd).calls.find(predicate);
}

export function parseShell(cmd: string, baseCwd = ""): ShellParseResult {
  const subs = splitOnOperators(cmd);
  const calls: ShellCall[] = [];
  let cwd = baseCwd;
  for (const sub of subs) {
    const trimmed = sub.trim();
    if (!trimmed) continue;
    const redirections = scanRedirections(trimmed);
    const tokens = stripRedirections(shellSplit(trimmed));
    if (tokens.length === 0) continue;
    const name = basename(tokens[0]!);
    const args = tokens.slice(1);
    // The call runs in the cwd in effect BEFORE its own `cd` takes hold; a
    // `cd` only moves the directory for the calls that follow it.
    calls.push({ name, args, raw: trimmed, cwd, redirections });
    if (name === "cd") cwd = applyCd(cwd, args);
  }
  return { calls, redirections: calls.flatMap((c) => c.redirections) };
}

/** Fold a single `cd` over the running cwd. */
function applyCd(cwd: string, args: string[]): string {
  const target = args.find((a) => !a.startsWith("-"));
  // `cd` / `cd -` / `cd ~…` resolve to dirs we can't know here; leave the cwd
  // unchanged rather than guess. Absolute targets replace it; relative ones
  // fold onto it.
  if (!target || target === "-" || target.startsWith("~")) return cwd;
  return resolve(cwd, target);
}

/**
 * Drop redirection operators and their targets from a token list so they don't
 * masquerade as positional args (e.g. `echo x > f` → `["x"]`, not `["x",">","f"]`).
 * Redirections are surfaced separately on `ShellCall.redirections`.
 */
function stripRedirections(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (/^\d*>>?$/.test(t)) { i++; continue; } // bare operator: skip its target too
    if (/^\d*>>?/.test(t)) continue; // operator glued to target (`>foo`, `2>>foo`)
    out.push(t);
  }
  return out;
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function splitOnOperators(s: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let mode: Mode = "none";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];
    if (mode === "none") {
      if (c === "'") { mode = "single"; cur += c; continue; }
      if (c === '"') { mode = "double"; cur += c; continue; }

      if (c === "\\" && next !== undefined) { cur += c + next; i++; continue; }
      if ((c === "&" && next === "&") || (c === "|" && next === "|")) {
        parts.push(cur); cur = ""; i++; continue;
      }
      if (c === ";" || c === "|" || c === "&") {
        parts.push(cur); cur = ""; continue;
      }
      cur += c;
    } else if (mode === "single") {
      cur += c;
      if (c === "'") mode = "none";
    } else {

      if (c === "\\" && next !== undefined) { cur += c + next; i++; continue; }
      cur += c;
      if (c === '"') mode = "none";
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

function shellSplit(s: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let started = false;
  let mode: Mode = "none";
  const flush = () => {
    if (started) { tokens.push(cur); cur = ""; started = false; }
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const next = s[i + 1];
    if (mode === "none") {
      if (c === "'") { mode = "single"; started = true; continue; }
      if (c === '"') { mode = "double"; started = true; continue; }
      if (c === "\\" && next !== undefined) { cur += next; started = true; i++; continue; }
      if (/\s/.test(c)) { flush(); continue; }
      cur += c; started = true;
    } else if (mode === "single") {
      if (c === "'") { mode = "none"; continue; }
      cur += c;
    } else {
      if (c === '"') { mode = "none"; continue; }

      if (c === "\\" && next !== undefined) { cur += next; i++; continue; }
      cur += c;
    }
  }
  flush();
  return tokens;
}

function scanRedirections(cmd: string): ShellRedirection[] {
  // Mask quoted regions so `>` inside strings doesn't count as redirection.
  let masked = "";
  let mode: Mode = "none";
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    const next = cmd[i + 1];
    if (mode === "none") {
      if (c === "'") { mode = "single"; masked += " "; continue; }
      if (c === '"') { mode = "double"; masked += " "; continue; }

      if (c === "\\" && next !== undefined) { masked += "  "; i++; continue; }
      masked += c;
    } else if (mode === "single") {
      if (c === "'") { mode = "none"; masked += " "; continue; }
      masked += " ";
    } else {
      if (c === '"') { mode = "none"; masked += " "; continue; }

      if (c === "\\" && next !== undefined) { masked += "  "; i++; continue; }
      masked += " ";
    }
  }
  const out: ShellRedirection[] = [];
  for (const m of masked.matchAll(/(>>|>)\s*(\S+)/g)) {
    out.push({ op: m[1] as ">" | ">>", target: m[2]! });
  }
  return out;
}
