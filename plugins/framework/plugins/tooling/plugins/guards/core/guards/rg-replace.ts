import { defineGuard } from "../define-guard";
import { findCall } from "../parse-shell";
import type { BashInput } from "../types";

// ripgrep short flags (other than -r) that consume a value: anything that
// follows them in the same cluster is THAT flag's value, not a further flag.
// So a trailing `r` after one of these is data, not --replace:
//   -er  → -e with regexp "r"     (search for "r", NOT a replace)
//   -tr  → -t with type   "r"
//   -gr  → -g with glob   "r"
//   -Ar  → -A with context "r"
// Source: `rg --help` short forms. If a value-taking flag is missed here the
// worst case is a benign over-block, never a missed footgun.
const VALUE_TAKING_SHORT_FLAGS = new Set("ABCefgMmtT".split(""));

/**
 * True when `arg` is a bundled short-flag cluster that (unintentionally) turns
 * on ripgrep's `-r`/`--replace`. In ripgrep `-r` takes a value, so `rg -rn`
 * silently replaces every match with "n" — classic `grep -rn` muscle memory.
 *
 * We walk the cluster left-to-right: the first `r` reached as a *flag* engages
 * replace; but if a different value-taking short flag comes first, the rest of
 * the cluster is its value and any later `r` is data, not the replace flag.
 * Only single-dash letter clusters qualify — the explicit long form
 * `--replace` is deliberate intent and is left alone.
 */
function assignsShortReplace(arg: string): boolean {
  if (!/^-[a-zA-Z]+$/.test(arg)) return false; // not a short cluster (`--replace`, `-`, `-1`, paths)
  for (const ch of arg.slice(1)) {
    if (ch === "r") return true; // reached -r as a flag → replace engaged
    if (VALUE_TAKING_SHORT_FLAGS.has(ch)) return false; // rest of cluster is this flag's value
  }
  return false;
}

export const rgReplaceGuard = defineGuard<BashInput>({
  name: "rg-replace",
  matcher: "Bash",
  check(input) {
    const cmd = input.command;
    if (!cmd) return null;
    const offending = findCall(
      cmd,
      (c) =>
        (c.name === "rg" || c.name === "ripgrep") &&
        c.args.some(assignsShortReplace),
    );
    if (!offending) return null;
    const bad = offending.args.find(assignsShortReplace)!;
    return {
      blocked: `\`rg ${bad}\` — in ripgrep \`-r\` means \`--replace\`, not recursive (rg is recursive by default).`,
      why: `grep muscle memory: \`grep -rn\` is recursive + line numbers, but \`rg -rn\` silently replaces every match with "n" in the output (and a lone \`rg -r\` consumes the next argument as the replacement). Either way the result looks like a normal search but is corrupted.`,
      hint: "Drop the -r. `rg -n` gives line numbers; recursion is the default. For an actual replacement, write the explicit long form `rg --replace '<value>'`.",
    };
  },
});
