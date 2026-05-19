import { defineGuard } from "../define-guard";
import { parseShell } from "../parse-shell";
import type { BashInput } from "../types";

// Matches combined short flags containing -r, like -rn, -rnl, -rni, etc.
// These are almost always grep muscle memory (recursive + line numbers)
// but in ripgrep -r means --replace, so -rn silently replaces matches with "n".
const COMBINED_R_FLAG = /^-[a-zA-Z]*r[a-zA-Z]+$|^-[a-zA-Z]+r$/;

export const rgReplaceGuard = defineGuard<BashInput>({
  name: "rg-replace",
  matcher: "Bash",
  check(input) {
    const cmd = input.command;
    if (!cmd) return null;
    const { calls } = parseShell(cmd);
    const rg = calls.find((c) => c.name === "rg" || c.name === "ripgrep");
    if (!rg) return null;
    const bad = rg.args.find((a) => COMBINED_R_FLAG.test(a));
    if (!bad) return null;
    return {
      blocked: `\`rg ${bad}\` — in ripgrep \`-r\` means \`--replace\`, not recursive (rg is recursive by default).`,
      why: `grep muscle memory: \`grep -rn\` is recursive + line numbers, but \`rg -rn\` silently replaces every match with "n" in the output.`,
      hint: "Drop the -r. `rg -n` gives line numbers; recursion is the default. For an actual replacement use `rg -r '<replacement>'` as a separate flag.",
    };
  },
});
