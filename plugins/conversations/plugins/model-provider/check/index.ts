import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const ALLOWED_PATHS = [
  "plugins/conversations/plugins/model-provider/core/registry.ts",
  "plugins/conversations/plugins/model-provider/check/index.ts",
];

const check: Check = {
  id: "model-provider:no-raw-model-flags",
  description:
    "Claude model CLI flags (claude-opus-*, claude-sonnet-*, claude-haiku-*) must be resolved through the model-provider registry, never hardcoded",
  async run() {
    const root = await getRoot();
    const matches = await grepCode({
      root,
      pattern: /claude-(opus|sonnet|haiku)-[0-9]/,
      grepArg: "claude-(opus|sonnet|haiku)-[0-9]",
      maskStrings: false,
    });

    const offenders = matches
      .filter((m) => {
        if (ALLOWED_PATHS.some((p) => m.path === p || m.path.startsWith(p)))
          return false;
        if (m.path.startsWith("research/")) return false;
        return true;
      })
      .map((m) => `${m.path}:${m.line}:${m.text}`);

    if (offenders.length === 0) return { ok: true };

    return {
      ok: false,
      message: `hardcoded Claude model CLI flag found in ${offenders.length} place(s):\n    ${offenders.join("\n    ")}`,
      hint: "Resolve CLI flags through cliFlagFor()/currentModelForTier() in model-provider/core/registry.ts — never hardcode claude-* flags.",
    };
  },
};

export default check;
