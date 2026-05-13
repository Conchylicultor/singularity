import type { ParsedCombo } from "./types";

export const isMac =
  typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);

const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  return: "enter",
  del: "delete",
  space: " ",
};

export function parseCombo(keys: string): ParsedCombo | null {
  const combo: ParsedCombo = {
    mod: false,
    ctrl: false,
    shift: false,
    alt: false,
    key: "",
  };

  const tokens = keys.toLowerCase().split("+").filter(Boolean);
  if (tokens.length === 0) return null;

  for (const token of tokens) {
    if (token === "mod" || token === "meta" || token === "cmd") {
      combo.mod = true;
    } else if (token === "ctrl" || token === "control") {
      combo.ctrl = true;
    } else if (token === "shift") {
      combo.shift = true;
    } else if (token === "alt" || token === "option") {
      combo.alt = true;
    } else if (combo.key === "") {
      combo.key = KEY_ALIASES[token] ?? token;
    } else {
      return null;
    }
  }

  if (combo.key === "") return null;
  return combo;
}

export function matchesEvent(parsed: ParsedCombo, e: KeyboardEvent): boolean {
  if (e.key.toLowerCase() !== parsed.key) return false;

  if (isMac) {
    if (parsed.mod !== e.metaKey) return false;
    if (parsed.ctrl !== e.ctrlKey) return false;
  } else {
    // mod and ctrl both map to ctrlKey on non-Mac
    if ((parsed.mod || parsed.ctrl) !== e.ctrlKey) return false;
    if (e.metaKey) return false;
  }

  if (parsed.shift !== e.shiftKey) return false;
  if (parsed.alt !== e.altKey) return false;

  return true;
}

const comboCache = new Map<string, ParsedCombo | null>();

export function getCachedCombo(keys: string): ParsedCombo | null {
  let cached = comboCache.get(keys);
  if (cached === undefined) {
    cached = parseCombo(keys);
    comboCache.set(keys, cached);
  }
  return cached;
}
