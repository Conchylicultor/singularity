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
  const calls: ShellCall[] = [];
  collect(cmd, baseCwd, calls, 0);
  return { calls, redirections: calls.flatMap((c) => c.redirections) };
}

/** Guards against a pathological nesting depth in hand-written input. */
const MAX_DEPTH = 8;

/**
 * Walk one command string, appending a `ShellCall` per simple command found —
 * INCLUDING the ones nested inside loop bodies, `if` branches, command
 * substitutions and subshells.
 *
 * Reaching inside those is the whole point. `splitOnOperators` alone yields a
 * flat token stream in which `until X; do git push; done` becomes a call
 * literally *named* `do` carrying `["git", "push"]` as its args — so every
 * predicate of the shape `c.name === "git" && c.args[0] === "push"` silently
 * fails to match, and the guard that owns it may as well not exist. The same
 * held for `$(…)`, backticks and `( … )` groups. Any construct a shell executes
 * must produce a call here, or it becomes a blind spot every Bash guard shares.
 *
 * Returns the cwd in effect after the last segment. Inner scopes get the
 * enclosing cwd and their return value is discarded on purpose: a `cd` inside a
 * subshell or a `$( … )` does not move the parent shell's directory.
 */
function collect(
  cmd: string,
  baseCwd: string,
  out: ShellCall[],
  depth: number,
): string {
  if (depth > MAX_DEPTH) return baseCwd;
  let cwd = baseCwd;
  for (const sub of splitOnOperators(cmd)) {
    const seg = sub.trim();
    if (!seg) continue;

    // Pull `$( … )` / backtick bodies out FIRST, so their contents are parsed as
    // commands rather than swallowed as opaque argument text — and so the
    // prefix peel below cannot mistake a substitution body for a command. In
    // `x=$(cd /tmp && pwd)` the assignment's value spans a space, so peeling on
    // whitespace before extraction would strand `/tmp && pwd)` as the command.
    const { stripped, inner } = extractSubstitutions(seg);
    const head = peelPrefixes(stripped);

    // A whole `( … )` group is its own shell: parse it in an isolated scope so
    // a `cd` inside cannot move the parent's directory.
    if (head.startsWith("(") && matchParen(head, 0) === head.length - 1) {
      collect(head.slice(1, -1), cwd, out, depth + 1);
      for (const src of inner) collect(src, cwd, out, depth + 1);
      continue;
    }

    const tokens = stripGroupParens(stripRedirections(shellSplit(head)));
    const redirections = scanRedirections(head);
    // A wrapper (`nohup`, `env`, `sudo`, `xargs`, `timeout`, …) carries the real
    // command in its args, hiding it from every name-matching predicate the same
    // way a loop body did — `nohup git push` would otherwise walk past git-push.
    // Emit the wrapper AND what it wraps, peeling one layer at a time.
    for (let toks = tokens; toks.length > 0;) {
      const name = basename(toks[0]!);
      const args = toks.slice(1);
      // The call runs in the cwd in effect BEFORE its own `cd` takes hold; a
      // `cd` only moves the directory for the calls that follow it.
      out.push({ name, args, raw: seg, cwd, redirections });
      if (name === "cd") cwd = applyCd(cwd, args);
      if (!WRAPPERS.has(name)) break;
      const wrapped = dropWrapperOptions(args);
      if (wrapped.length === 0 || wrapped.length === toks.length) break;
      toks = wrapped;
    }

    for (const src of inner) collect(src, cwd, out, depth + 1);
  }
  return cwd;
}

/**
 * Shell words that introduce a command rather than being one. Peeling them is
 * what turns `do git push` back into `git push`.
 */
const BLOCK_KEYWORDS = new Set([
  "until",
  "while",
  "if",
  "elif",
  "then",
  "else",
  "do",
  "done",
  "fi",
  "case",
  "esac",
  "select",
  "time",
  "!",
  "{",
  "}",
]);

/**
 * Binaries whose job is to run another command. The wrapped command must surface
 * as its own call, or wrapping becomes a way past every Bash guard.
 */
const WRAPPERS = new Set([
  "nohup",
  "setsid",
  "env",
  "sudo",
  "nice",
  "ionice",
  "stdbuf",
  "timeout",
  "xargs",
  "command",
  "exec",
  "time",
  "script",
  "caffeinate",
  "taskpolicy",
  "darwinbg",
  "watch",
]);

/**
 * Drop a wrapper's own flags and their values so the wrapped command is first:
 * `timeout 30 cmd`, `nice -n 5 cmd`, `env FOO=1 cmd` all reduce to `cmd`.
 */
function dropWrapperOptions(args: string[]): string[] {
  let i = 0;
  while (i < args.length) {
    const a = args[i]!;
    if (a.startsWith("-")) {
      i++;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) {
      i++;
      continue;
    }
    // A bare duration/priority belongs to `timeout`/`nice`, not to the command.
    if (/^\d+(\.\d+)?[smhd]?$/.test(a)) {
      i++;
      continue;
    }
    break;
  }
  return args.slice(i);
}

/**
 * Strip leading block keywords and `VAR=value` prefixes off a segment until a
 * real command name is exposed. Returns "" when the segment holds no command.
 */
function peelPrefixes(seg: string): string {
  let s = seg;
  for (;;) {
    if (!s) return "";
    const sp = s.search(/\s/);
    const head = sp === -1 ? s : s.slice(0, sp);
    // `for f in a b` binds a variable over a word list — never a command.
    if (head === "for") return "";
    const isAssignment = /^[A-Za-z_][A-Za-z0-9_]*=/.test(head);
    if (!isAssignment && !BLOCK_KEYWORDS.has(head)) return s;
    s = sp === -1 ? "" : s.slice(sp + 1).trim();
  }
}

/**
 * Split a segment into the text outside command substitutions and the sources
 * inside them. Single-quoted regions are left alone — the shell does not expand
 * substitutions there, so neither do we.
 */
function extractSubstitutions(s: string): {
  stripped: string;
  inner: string[];
} {
  const inner: string[] = [];
  let stripped = "";
  let mode: Mode = "none";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const next = s[i + 1];
    if (mode === "single") {
      stripped += c;
      if (c === "'") mode = "none";
      continue;
    }
    if (c === "\\" && next !== undefined) {
      stripped += c + next;
      i++;
      continue;
    }
    if (mode === "none" && c === "'") {
      mode = "single";
      stripped += c;
      continue;
    }
    if (c === '"') {
      mode = mode === "double" ? "none" : "double";
      stripped += c;
      continue;
    }
    if (c === "$" && next === "(") {
      const end = matchParen(s, i + 1);
      if (end !== -1) {
        inner.push(s.slice(i + 2, end));
        i = end;
        continue;
      }
    }
    if (c === "`") {
      const end = s.indexOf("`", i + 1);
      if (end !== -1) {
        inner.push(s.slice(i + 1, end));
        i = end;
        continue;
      }
    }
    stripped += c;
  }
  return { stripped, inner };
}

/** Index of the `)` closing the `(` at `open`, or -1 when unbalanced. */
function matchParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Drop the parentheses of a `( … )` group so its first word is read as the
 * command name. `splitOnOperators` is paren-blind, so a group containing an
 * operator arrives here already split (`(a && b)` → `(a`, `b)`) — hence leading
 * and trailing parens are handled independently, and the trailing one only when
 * this segment is actually unbalanced.
 */
function stripGroupParens(tokens: string[]): string[] {
  const out = tokens.slice();
  while (out.length > 0 && out[0]!.startsWith("(")) {
    const head = out[0]!.replace(/^\(+/, "");
    if (head) out[0] = head;
    else out.shift();
  }
  const joined = out.join(" ");
  const opens = (joined.match(/\(/g) ?? []).length;
  const closes = (joined.match(/\)/g) ?? []).length;
  if (closes > opens && out.length > 0) {
    const last = out.length - 1;
    const tail = out[last]!.replace(/\)+$/, "");
    if (tail) out[last] = tail;
    else out.pop();
  }
  return out;
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
    if (/^\d*>>?$/.test(t)) {
      i++;
      continue;
    } // bare operator: skip its target too
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
  // Depth of `(` … `)` — covers both subshells and `$( … )`. Operators inside a
  // group are the GROUP's, not ours: splitting there would tear a substitution
  // body apart before `extractSubstitutions` ever sees it, and would strand a
  // subshell's `cd` in the parent scope.
  let depth = 0;
  let inBacktick = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];
    if (mode === "none") {
      if (c === "'") {
        mode = "single";
        cur += c;
        continue;
      }
      if (c === '"') {
        mode = "double";
        cur += c;
        continue;
      }

      if (c === "\\" && next !== undefined) {
        cur += c + next;
        i++;
        continue;
      }
      if (c === "`") {
        inBacktick = !inBacktick;
        cur += c;
        continue;
      }
      if (c === "(") {
        depth++;
        cur += c;
        continue;
      }
      if (c === ")") {
        if (depth > 0) depth--;
        cur += c;
        continue;
      }
      if (depth > 0 || inBacktick) {
        cur += c;
        continue;
      }
      // `2>&1` / `&>file`: the `&` belongs to the redirection, not to us.
      if (c === "&" && (s[i - 1] === ">" || next === ">")) {
        cur += c;
        continue;
      }
      if ((c === "&" && next === "&") || (c === "|" && next === "|")) {
        parts.push(cur);
        cur = "";
        i++;
        continue;
      }
      // Newlines are command separators too — a multi-line script must split
      // into one call per line, or a dangerous call on line 2+ would collapse
      // into line 1's token stream and lose its name/cwd attribution. A line
      // continuation (`\<newline>`) is consumed by the `\\` escape branch above,
      // so it never reaches here and correctly does NOT split.
      if (c === ";" || c === "|" || c === "&" || c === "\n" || c === "\r") {
        parts.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    } else if (mode === "single") {
      cur += c;
      if (c === "'") mode = "none";
    } else {
      if (c === "\\" && next !== undefined) {
        cur += c + next;
        i++;
        continue;
      }
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
    if (started) {
      tokens.push(cur);
      cur = "";
      started = false;
    }
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const next = s[i + 1];
    if (mode === "none") {
      if (c === "'") {
        mode = "single";
        started = true;
        continue;
      }
      if (c === '"') {
        mode = "double";
        started = true;
        continue;
      }
      if (c === "\\" && next !== undefined) {
        cur += next;
        started = true;
        i++;
        continue;
      }
      if (/\s/.test(c)) {
        flush();
        continue;
      }
      cur += c;
      started = true;
    } else if (mode === "single") {
      if (c === "'") {
        mode = "none";
        continue;
      }
      cur += c;
    } else {
      if (c === '"') {
        mode = "none";
        continue;
      }

      if (c === "\\" && next !== undefined) {
        cur += next;
        i++;
        continue;
      }
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
      if (c === "'") {
        mode = "single";
        masked += " ";
        continue;
      }
      if (c === '"') {
        mode = "double";
        masked += " ";
        continue;
      }

      if (c === "\\" && next !== undefined) {
        masked += "  ";
        i++;
        continue;
      }
      masked += c;
    } else if (mode === "single") {
      if (c === "'") {
        mode = "none";
        masked += " ";
        continue;
      }
      masked += " ";
    } else {
      if (c === '"') {
        mode = "none";
        masked += " ";
        continue;
      }

      if (c === "\\" && next !== undefined) {
        masked += "  ";
        i++;
        continue;
      }
      masked += " ";
    }
  }
  const out: ShellRedirection[] = [];
  for (const m of masked.matchAll(/(>>|>)\s*(\S+)/g)) {
    out.push({ op: m[1] as ">" | ">>", target: m[2]! });
  }
  return out;
}
