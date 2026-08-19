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
  /**
   * The text the shell would actually EXECUTE: the input with every heredoc body
   * — and the `<<DELIM` operator introducing it — removed.
   *
   * A guard that must regex raw command text reads THIS, never `input.command`,
   * or a document being WRITTEN reads as a command being RUN. A body an
   * interpreter executes (`bash <<EOF`) is not re-inserted here; its commands
   * still surface in `calls`.
   */
  code: string;
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
 *
 * Pass `baseCwd` whenever the predicate resolves a path. Without it each call's
 * `cwd` is `""`, and `resolve("", rel)` quietly falls back to the guard
 * PROCESS's own directory — an answer that happens to be right today and has no
 * reason to stay right.
 */
export function findCall(
  cmd: string,
  predicate: (call: ShellCall) => boolean,
  baseCwd = "",
): ShellCall | undefined {
  return parseShell(cmd, baseCwd).calls.find(predicate);
}

export function parseShell(cmd: string, baseCwd = ""): ShellParseResult {
  const calls: ShellCall[] = [];
  const { code } = collect(cmd, baseCwd, calls, 0);
  return { calls, redirections: calls.flatMap((c) => c.redirections), code };
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
 * Returns the cwd in effect after the last segment, and the executable text this
 * scope parsed (its input minus every heredoc body). Inner scopes get the
 * enclosing cwd and their return value is discarded on purpose: a `cd` inside a
 * subshell or a `$( … )` does not move the parent shell's directory.
 *
 * The heredoc pre-pass runs HERE rather than once in `parseShell`, so every
 * context this function parses is heredoc-modelled — the top-level string, a
 * `$( … )` body, a backtick body, a `( … )` group. `splitOnOperators` splits on
 * newlines, so any body that survives into it is read line-by-line as commands,
 * which is the whole bug this models away.
 */
function collect(
  cmd: string,
  baseCwd: string,
  out: ShellCall[],
  depth: number,
): { cwd: string; code: string } {
  if (depth > MAX_DEPTH) return { cwd: baseCwd, code: cmd };
  const { code, docs } = splitHeredocs(cmd);
  let cwd = baseCwd;
  /** One entry per segment, so a heredoc body can be attributed to its owner. */
  const segs: Segment[] = [];
  for (const part of splitOnOperators(code)) {
    const from = out.length;
    const segCwd = cwd;
    const seg = part.text.trim();
    if (seg) cwd = collectSegment(seg, cwd, out, depth);
    segs.push({
      end: part.end,
      sep: part.sep,
      from,
      to: out.length,
      cwd: segCwd,
    });
  }
  for (const doc of docs) attachDoc(doc, segs, out, baseCwd, depth);
  return { cwd, code };
}

/** A segment of a compound command, plus the span of `out` it contributed. */
interface Segment {
  /** Offset in `code` just past this segment's text (its separator's index). */
  end: number;
  /** The operator that ended this segment (`""` for the last one). */
  sep: string;
  from: number;
  to: number;
  /** The cwd in effect BEFORE this segment's own `cd`. */
  cwd: string;
}

/** Emit the calls of one already-split segment; returns the cwd after it. */
function collectSegment(
  seg: string,
  cwd: string,
  out: ShellCall[],
  depth: number,
): string {
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
    return cwd;
  }

  let cur = cwd;
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
    out.push({ name, args, raw: seg, cwd: cur, redirections });
    if (name === "cd") cur = applyCd(cur, args);
    if (!WRAPPERS.has(name)) break;
    const wrapped = dropWrapperOptions(args);
    if (wrapped.length === 0 || wrapped.length === toks.length) break;
    toks = wrapped;
  }

  for (const src of inner) collect(src, cur, out, depth + 1);
  return cur;
}

/** A heredoc operator seen on the current line, awaiting its body. */
interface PendingHeredoc {
  delim: string;
  expanded: boolean;
  strip: boolean;
  at: number;
}

/** One heredoc lifted out of a command by `splitHeredocs`. */
interface HeredocDoc {
  /** The body text, verbatim, minus the terminator line. */
  body: string;
  /** Unquoted delimiter: the shell expands `$( … )` / backticks inside the body. */
  expanded: boolean;
  /** Offset in `code` where the `<<DELIM` operator was removed. */
  at: number;
}

/**
 * A delimiter word, in the four spellings bash accepts. Anything else is left
 * alone — the grammar is what keeps `$((x << shift))` and stray `a << b` prose
 * from starting a "body" that swallows the rest of the command and blinds every
 * guard after it. Only the bare form expands the body.
 */
const HEREDOC_DELIM =
  /^(?:'([A-Za-z_][\w.-]*)'|"([A-Za-z_][\w.-]*)"|\\([A-Za-z_][\w.-]*)|([A-Za-z_][\w.-]*))/;

/**
 * Binaries that read a script on stdin, so their heredoc body IS executed.
 *
 * `python3 - <<'PY'` and friends are deliberately absent: their bodies are not
 * shell, and pretending otherwise mints phantom calls out of another language's
 * source. That blind spot is the same one `python3 -c "…"` already has, and
 * making it consistent beats making it lucky.
 */
const SHELL_INTERPRETERS = new Set([
  "bash",
  "sh",
  "zsh",
  "dash",
  "ksh",
  "mksh",
  "ash",
]);

/**
 * Lift every heredoc body out of a command, leaving the text the shell actually
 * executes.
 *
 * A body is data handed to a process on stdin — never part of the token stream.
 * Left in place it is read as commands, because `splitOnOperators` splits on
 * newlines and `extractSubstitutions` lifts backticks: a markdown document
 * written by `cat > x.md <<'EOF'` then parses as a script, and every Bash guard
 * denies the write on a command nothing is running.
 *
 * The scanner tracks quoting AND substitution context, not quoting alone. The
 * commonest heredoc in this repo is
 *
 *     ./singularity push -m "$(cat <<'EOF'   ← `<<` sits inside the `-m` quote
 *
 * where a quote-only mask declines. It is tempting to leave that to the
 * recursion — `splitOnOperators` keeps the whole `$( … )` in one segment, so the
 * body reaches `collect` again through `extractSubstitutions` and is stripped
 * there. That holds only while the body's `"` count is even: one unpaired quote
 * in the prose flips the mode back to `none` mid-body, and the remaining lines
 * split at depth 0 into phantom commands the recursion never sees. Entering a
 * `$( … )` restores the fresh quoting context the shell itself uses, so the body
 * is removed here — which also repairs the quote tracking downstream instead of
 * working around it.
 */
function splitHeredocs(text: string): { code: string; docs: HeredocDoc[] } {
  if (!text.includes("<<")) return { code: text, docs: [] };

  const docs: HeredocDoc[] = [];
  const pending: PendingHeredoc[] = [];
  let code = "";
  let mode: Mode = "none";
  /** Quoting modes suspended by an enclosing `$( … )` / `( … )` / backtick. */
  const frames: { mode: Mode; kind: "subst" | "paren" | "backtick" }[] = [];
  let i = 0;

  while (i < text.length) {
    const c = text[i]!;
    const next = text[i + 1];

    if (c === "\n") {
      code += c;
      i++;
      if (pending.length > 0) i = consumeBodies(text, i, pending, docs);
      continue;
    }

    if (mode === "single") {
      code += c;
      if (c === "'") mode = "none";
      i++;
      continue;
    }

    if (c === "\\" && next !== undefined) {
      code += c + next;
      i += 2;
      continue;
    }

    if (mode === "none") {
      if (c === "'") {
        mode = "single";
        code += c;
        i++;
        continue;
      }
      // A comment runs to end of line: `# see <<EOF for details` must not start
      // a body that eats the rest of the script.
      if (c === "#" && (code === "" || /[\s;|&(]$/.test(code))) {
        const nl = text.indexOf("\n", i);
        const end = nl === -1 ? text.length : nl;
        code += text.slice(i, end);
        i = end;
        continue;
      }
    }

    if (c === '"') {
      mode = mode === "double" ? "none" : "double";
      code += c;
      i++;
      continue;
    }

    // `$(( … ))` is arithmetic, not a command: copy it verbatim so `x << shift`
    // inside it can never be read as a heredoc.
    if (c === "$" && next === "(" && text[i + 2] === "(") {
      const end = matchParen(text, i + 1);
      if (end !== -1) {
        code += text.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }

    // A substitution starts a fresh quoting context, in `none` AND in `double`.
    if (c === "$" && next === "(") {
      frames.push({ mode, kind: "subst" });
      mode = "none";
      code += "$(";
      i += 2;
      continue;
    }
    if (c === "`") {
      const top = frames.at(-1);
      if (top?.kind === "backtick") {
        mode = top.mode;
        frames.pop();
      } else {
        frames.push({ mode, kind: "backtick" });
        mode = "none";
      }
      code += c;
      i++;
      continue;
    }
    if (mode === "none" && c === "(") {
      frames.push({ mode, kind: "paren" });
      code += c;
      i++;
      continue;
    }
    if (mode === "none" && c === ")") {
      const top = frames.at(-1);
      if (top && top.kind !== "backtick") {
        mode = top.mode;
        frames.pop();
      }
      code += c;
      i++;
      continue;
    }

    if (mode === "none" && c === "<" && next === "<") {
      // `<<<` is a here-string, not a heredoc. Stepping one char at a time would
      // land on the second `<`, read `<<` + a word, and swallow every following
      // line as a body — so consume all three at once.
      if (text[i + 2] === "<") {
        code += "<<<";
        i += 3;
        continue;
      }
      const doc = matchHeredocOperator(text, i);
      if (doc) {
        // Drop the operator's own text: the pre-pass knows its exact offsets,
        // where a token-level rule could not tell `<<EOF` from a quoted `"<<x>>"`
        // argument, `shellSplit` having already erased the quotes.
        code = code.replace(/\d+$/, "");
        pending.push({ ...doc, at: code.length });
        i = doc.end;
        continue;
      }
    }

    code += c;
    i++;
  }

  // An unterminated heredoc: bash errors, but the body is still not a command.
  if (pending.length > 0) consumeBodies(text, i, pending, docs);
  return { code, docs };
}

/** Read one `\d*<<-?DELIM` operator at `i`, or null when it is not one. */
function matchHeredocOperator(
  text: string,
  i: number,
): (Omit<PendingHeredoc, "at"> & { end: number }) | null {
  let j = i + 2;
  const strip = text[j] === "-";
  if (strip) j++;
  while (text[j] === " " || text[j] === "\t") j++;
  const m = HEREDOC_DELIM.exec(text.slice(j));
  if (!m) return null;
  const delim = m[1] ?? m[2] ?? m[3] ?? m[4]!;
  return { delim, expanded: m[4] !== undefined, strip, end: j + m[0].length };
}

/**
 * Consume one body per pending operator, in the order the operators appeared,
 * and return the offset just past the last terminator.
 *
 * The terminator test is deliberately lax (`trim()`, where bash wants an exact
 * line): terminating earlier than the shell leaves text OUTSIDE the body, where
 * it is still parsed. Erring the other way would hide real commands.
 */
function consumeBodies(
  text: string,
  start: number,
  pending: PendingHeredoc[],
  docs: HeredocDoc[],
): number {
  let i = start;
  for (const p of pending) {
    const lines: string[] = [];
    while (i < text.length) {
      const nl = text.indexOf("\n", i);
      const line = nl === -1 ? text.slice(i) : text.slice(i, nl);
      i = nl === -1 ? text.length : nl + 1;
      const candidate = p.strip ? line.replace(/^\t+/, "") : line;
      if (candidate.trim() === p.delim) break;
      lines.push(line);
    }
    docs.push({ body: lines.join("\n"), expanded: p.expanded, at: p.at });
  }
  pending.length = 0;
  return i;
}

/**
 * Parse a heredoc body as far as the shell would, and no further.
 *
 * `bash <<'EOF'` executes its body whatever the delimiter quoting, and so does
 * `cat <<'EOF' … | bash` — without the pipeline arm this fix would hand every
 * Bash guard a one-line bypass. An unquoted delimiter expands substitutions but
 * runs nothing else. A quoted delimiter on a non-interpreter is inert data, the
 * 97% case, and contributes nothing.
 */
function attachDoc(
  doc: HeredocDoc,
  segs: Segment[],
  out: ShellCall[],
  baseCwd: string,
  depth: number,
): void {
  const i = segs.findIndex((s) => doc.at <= s.end);
  const owner = i === -1 ? segs.at(-1) : segs[i];
  // The body runs where its own segment runs: `cd sub && bash <<'EOF'` must not
  // resolve the body's paths against the parent directory.
  const cwd = owner?.cwd ?? baseCwd;
  const interpreter = (s: Segment | undefined) =>
    !!s && out.slice(s.from, s.to).some((c) => SHELL_INTERPRETERS.has(c.name));
  const piped = owner?.sep === "|" && i !== -1 ? segs[i + 1] : undefined;

  if (interpreter(owner) || interpreter(piped)) {
    collect(doc.body, cwd, out, depth + 1);
    return;
  }
  if (!doc.expanded) return;
  for (const src of bodySubstitutions(doc.body))
    collect(src, cwd, out, depth + 1);
}

/**
 * The `$( … )` / backtick sources inside an expanded heredoc body.
 *
 * Quote-BLIND on purpose: a body has no quoting, so `'` is a literal apostrophe
 * there. `extractSubstitutions` would let one open a phantom single-quoted region
 * and hide every substitution after it — `it's $(git push)` would parse to
 * nothing at all.
 */
function bodySubstitutions(body: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    const next = body[i + 1];
    if (c === "\\" && next !== undefined) {
      i++;
      continue;
    }
    if (c === "$" && next === "(") {
      const end = matchParen(body, i + 1);
      if (end !== -1) {
        out.push(body.slice(i + 2, end));
        i = end;
        continue;
      }
    }
    if (c === "`") {
      const end = body.indexOf("`", i + 1);
      if (end !== -1) {
        out.push(body.slice(i + 1, end));
        i = end;
      }
    }
  }
  return out;
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

/**
 * One part of a compound command, carrying its span so a heredoc body recorded
 * by the pre-pass can be attributed to the part that owns it — its cwd, and
 * whether it is piped into a shell.
 */
interface ShellPart {
  text: string;
  /** Offset in the input just past this part (its separator's index). */
  end: number;
  /** The operator that ended this part (`""` for the last one). */
  sep: string;
}

function splitOnOperators(s: string): ShellPart[] {
  const parts: ShellPart[] = [];
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
        parts.push({ text: cur, end: i, sep: c + next });
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
        parts.push({ text: cur, end: i, sep: c });
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
  if (cur) parts.push({ text: cur, end: s.length, sep: "" });
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

/**
 * The redirections of one segment — only the ones that name a file.
 *
 * `2>&1`, `>&2` and `2>&-` duplicate or close a file descriptor. They open
 * nothing, so reporting `&1` / `&2` / `&-` as a target hands every guard a path
 * that was never written. That one `&1` token is what made `main-writes` deny
 * `cd <main> && <read-only command> 2>&1`: replaying 30 days of Bash calls, it
 * accounted for 55 of that guard's 60 denials against 3 real ones. A guard whose
 * blocks are overwhelmingly noise is one agents learn to work around.
 *
 * The `&`-leading word must not be dropped wholesale, though. When the word is
 * not a descriptor, `>&word` is a different operator — bash's synonym for
 * `&>word`, which truncates that file and sends both streams into it. Dropping
 * the arm would read `cmd >&out.txt` as writing nothing, which is exactly the
 * hole the local `startsWith("&")` patch in `poll-detect.ts` carried. Keep the
 * file.
 *
 * So the `&` is matched as its own group rather than trimmed off the front of
 * the word. bash lets a space follow it (`ls >& out.txt`, `cmd 2>& 1` are both
 * valid), and a word-prefix test reads the bare `&` of the spaced form as the
 * whole target — which strips to the empty string, and `resolve(cwd, "")` is the
 * cwd itself. That is the same denial on the main checkout, one spelling over.
 */
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
  for (const m of masked.matchAll(/(>>|>)\s*(&?)\s*(\S+)/g)) {
    const [, op, amp, word] = m;
    // `2>&1` / `>&2` / `2>&-` duplicate or close a descriptor: no file is opened.
    if (amp && /^(\d+|-)$/.test(word!)) continue;
    out.push({ op: op as ">" | ">>", target: word! });
  }
  return out;
}
