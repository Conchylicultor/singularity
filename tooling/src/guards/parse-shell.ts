export interface ShellCall {
  name: string;
  args: string[];
  raw: string;
}

export interface ShellRedirection {
  op: ">" | ">>";
  target: string;
}

export interface ShellParseResult {
  calls: ShellCall[];
  redirections: ShellRedirection[];
}

type Mode = "none" | "single" | "double";

export function parseShell(cmd: string): ShellParseResult {
  const subs = splitOnOperators(cmd);
  const calls: ShellCall[] = [];
  for (const sub of subs) {
    const trimmed = sub.trim();
    if (!trimmed) continue;
    const tokens = shellSplit(trimmed);
    if (tokens.length === 0) continue;
    calls.push({ name: basename(tokens[0]), args: tokens.slice(1), raw: trimmed });
  }
  return { calls, redirections: scanRedirections(cmd) };
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
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
    const c = s[i];
    const next = s[i + 1];
    if (mode === "none") {
      if (c === "'") { mode = "single"; started = true; continue; }
      if (c === '"') { mode = "double"; started = true; continue; }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      if (c === "\\" && next !== undefined) { cur += next; started = true; i++; continue; }
      if (/\s/.test(c)) { flush(); continue; }
      cur += c; started = true;
    } else if (mode === "single") {
      if (c === "'") { mode = "none"; continue; }
      cur += c;
    } else {
      if (c === '"') { mode = "none"; continue; }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      if (c === "\\" && next !== undefined) { masked += "  "; i++; continue; }
      masked += c;
    } else if (mode === "single") {
      if (c === "'") { mode = "none"; masked += " "; continue; }
      masked += " ";
    } else {
      if (c === '"') { mode = "none"; masked += " "; continue; }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      if (c === "\\" && next !== undefined) { masked += "  "; i++; continue; }
      masked += " ";
    }
  }
  const out: ShellRedirection[] = [];
  for (const m of masked.matchAll(/(>>|>)\s*(\S+)/g)) {
    out.push({ op: m[1] as ">" | ">>", target: m[2] });
  }
  return out;
}
